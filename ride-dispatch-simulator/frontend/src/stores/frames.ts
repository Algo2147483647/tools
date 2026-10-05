import type { BenchmarkJob, SimulationEnvelope, SimulationState } from '../types';

export function decodeSimulationFrame(raw: unknown, simulationId: string) {
  if (!raw || typeof raw !== 'object') return null;
  const data = raw as SimulationEnvelope & { type: string; message?: string };
  if (
    !['snapshot', 'state', 'error'].includes(data.type) ||
    data.simulationId !== simulationId ||
    !data.state ||
    !Number.isSafeInteger(data.sequence)
  )
    return null;
  return {
    ...data,
    error:
      data.type === 'error'
        ? (data.message ?? 'Simulation stopped after an engine error')
        : data.error,
  };
}

/** REST and WebSocket share one monotonic server sequence. Missing history means unchanged. */
export function mergeFrame(
  previous: { sequence: number; state: SimulationState | null },
  sequence: number,
  incoming: Omit<SimulationState, 'history'> & { history?: SimulationState['history'] },
  freshConnectionSnapshot = false,
) {
  if (
    !Number.isSafeInteger(sequence) ||
    sequence < 0 ||
    (!freshConnectionSnapshot && sequence <= previous.sequence)
  )
    return null;
  return {
    sequence,
    state: { ...incoming, history: incoming.history ?? previous.state?.history ?? [] },
  };
}

/** A late restore response cannot move a streamed experiment backwards. */
export function mergeBenchmark(previous: BenchmarkJob | null, incoming: BenchmarkJob) {
  if (!previous || previous.benchmarkId !== incoming.benchmarkId) return incoming;
  if (incoming.completed < previous.completed) return previous;
  if (['completed', 'cancelled', 'failed'].includes(previous.status)) return previous;
  if (previous.status === 'running' && incoming.status === 'queued') return previous;
  return incoming;
}
