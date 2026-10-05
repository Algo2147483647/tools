import { api, ApiError, websocketUrl } from '../services/api';
import { ReconnectingSocket } from '../services/socket';
import { decodeSimulationFrame, mergeFrame } from './frames';
import type {
  AlgorithmMetadata,
  RoadNetwork,
  SimulationConfig,
  SimulationEnvelope,
  SimulationState,
} from '../types';

export interface ClientSnapshot {
  simulationId: string | null;
  network: RoadNetwork | null;
  state: SimulationState | null;
  algorithms: AlgorithmMetadata[];
  sequence: number;
  receivedAt: number;
  epoch: number;
  connection: 'loading' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  pending: boolean;
  error: string;
  engineError: string;
}
const storageKey = 'vector.simulation.session.v2';
class SimulationStore {
  private value: ClientSnapshot = {
    simulationId: null,
    network: null,
    state: null,
    algorithms: [],
    sequence: -1,
    receivedAt: 0,
    epoch: 0,
    connection: 'loading',
    pending: false,
    error: '',
    engineError: '',
  };
  private listeners = new Set<() => void>();
  private initializing: Promise<void> | null = null;
  private socket: ReconnectingSocket | null = null;
  private flush: ReturnType<typeof setTimeout> | null = null;
  private buffered: SimulationEnvelope | null = null;
  private lastAccepted = -1;
  private uiFlush: ReturnType<typeof setTimeout> | null = null;
  subscribe = (callback: () => void) => {
    this.listeners.add(callback);
    return () => {
      this.listeners.delete(callback);
    };
  };
  getSnapshot = () => this.value;
  private publish(patch: Partial<ClientSnapshot>, coalesce = false) {
    this.value = { ...this.value, ...patch };
    if (coalesce) {
      if (!this.uiFlush)
        this.uiFlush = setTimeout(() => {
          this.uiFlush = null;
          this.listeners.forEach((callback) => callback());
        }, 200);
      return;
    }
    if (this.uiFlush) clearTimeout(this.uiFlush);
    this.uiFlush = null;
    this.listeners.forEach((callback) => callback());
  }
  private apply(
    envelope: SimulationEnvelope,
    snap = false,
    coalesce = false,
    freshConnectionSnapshot = false,
  ) {
    const merged = mergeFrame(
      this.value,
      envelope.sequence,
      envelope.state,
      freshConnectionSnapshot,
    );
    if (!merged) return;
    this.lastAccepted = freshConnectionSnapshot
      ? envelope.sequence
      : Math.max(this.lastAccepted, envelope.sequence);
    if (this.buffered && this.buffered.sequence <= envelope.sequence) this.buffered = null;
    const reset =
      snap || (this.value.state !== null && envelope.state.time < this.value.state.time);
    this.publish(
      {
        ...merged,
        engineError: envelope.error ?? '',
        receivedAt: performance.now(),
        epoch: this.value.epoch + (reset ? 1 : 0),
        ...(envelope.network ? { network: envelope.network } : {}),
      },
      coalesce,
    );
  }
  initialize = (): Promise<void> => {
    if (this.initializing) return this.initializing;
    if (this.value.simulationId && this.value.connection !== 'error') return Promise.resolve();
    this.initializing = this.initializeSession().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  };
  reconnect = async () => {
    if (this.initializing) return this.initializing;
    this.socket?.close();
    this.socket = null;
    if (this.flush) clearTimeout(this.flush);
    this.flush = null;
    this.buffered = null;
    this.initializing = this.initializeSession().finally(() => {
      this.initializing = null;
    });
    return this.initializing;
  };
  private async initializeSession() {
    this.publish({ connection: 'loading', error: '' });
    try {
      const algorithms = await api.algorithms();
      let saved: string | null = null;
      try {
        saved = localStorage.getItem(storageKey);
      } catch {
        /* Storage is optional. */
      }
      let envelope: SimulationEnvelope;
      if (saved) {
        try {
          envelope = await api.restore(saved);
        } catch (error) {
          if (!(error instanceof ApiError) || error.status !== 404) throw error;
          envelope = await api.create();
        }
      } else envelope = await api.create();
      try {
        localStorage.setItem(storageKey, envelope.simulationId);
      } catch {
        /* Storage is optional. */
      }
      this.lastAccepted = -1;
      this.publish({ simulationId: envelope.simulationId, algorithms, sequence: -1, state: null });
      this.apply(envelope, true);
      this.connect(envelope.simulationId);
    } catch (error) {
      this.publish({
        connection: 'error',
        error: error instanceof Error ? error.message : 'Backend unavailable',
      });
    }
  }
  private connect(id: string) {
    this.socket?.close();
    this.socket = new ReconnectingSocket(
      websocketUrl(`/ws/simulation/${encodeURIComponent(id)}`),
      (raw, reconnected) => {
        const data = decodeSimulationFrame(raw, id);
        if (!data) return false;
        // The server emits 'snapshot' only as the first message on each socket. It establishes
        // the baseline even if the backend restarted between REST restoration and socket open.
        // Old socket messages are rejected by transport before reaching this store.
        if (data.type === 'snapshot') {
          if (this.flush) clearTimeout(this.flush);
          this.flush = null;
          this.buffered = null;
          this.apply(data, true, false, true);
          return true;
        }
        // A duplicate initial snapshot while paused still confirms a healthy connection.
        if (data.sequence <= this.lastAccepted) return true;
        if (data.type === 'error') {
          this.apply(data);
          return true;
        }
        this.lastAccepted = data.sequence;
        const previousHistory = this.buffered?.state.history ?? this.value.state?.history ?? [];
        this.buffered = {
          ...data,
          state: { ...data.state, history: data.state.history ?? previousHistory },
        };
        if (reconnected) {
          if (this.flush) clearTimeout(this.flush);
          this.flush = null;
          this.apply(this.buffered, true);
          this.buffered = null;
        } else if (!this.flush) {
          this.flush = setTimeout(() => {
            this.flush = null;
            if (this.buffered) this.apply(this.buffered, false, true);
            this.buffered = null;
          }, 80);
        }
        return true;
      },
      (connection) => {
        if (connection !== this.value.connection) this.publish({ connection });
      },
    );
  }
  command = async (action: string, data?: unknown, method?: string) => {
    if (this.value.pending || this.value.connection !== 'connected' || !this.value.simulationId)
      return false;
    this.publish({ pending: true, error: '' });
    const commandEpoch = this.value.epoch;
    try {
      const envelope = await api.command(this.value.simulationId, action, data, method);
      if (this.value.epoch === commandEpoch)
        this.apply(envelope, action === 'reset' || action === 'time');
      return true;
    } catch (error) {
      this.publish({ error: error instanceof Error ? error.message : 'Command failed' });
      return false;
    } finally {
      this.publish({ pending: false });
    }
  };
  configure = (config: Partial<SimulationConfig>) => this.command('config', config, 'PATCH');
}
export const simulationStore = new SimulationStore();
