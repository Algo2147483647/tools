export type SitlProtocol = 'betaflight' | 'px4';
export type SitlStatus = 'disconnected' | 'connecting' | 'ready' | 'waiting' | 'active' | 'error';
export interface SitlEvent { type: 'connecting' | 'ready' | 'actuators' | 'error' | 'disconnected'; session: number }
export interface SitlFrame {
  sequence: number; timeUs: number;
  positionNed: [number, number, number]; velocityNed: [number, number, number];
  quaternionWxyz: [number, number, number, number];
  gyroFrd: [number, number, number]; specificForceFrd: [number, number, number];
  rc: { roll: number; pitch: number; yaw: number; throttle: number; armed: boolean; angle: boolean };
}
interface VectorLike { x: number; y: number; z: number }
interface StateLike {
  position: VectorLike; velocity: VectorLike; quaternion: VectorLike & { w: number };
  angularVelocity: VectorLike; throttle: number;
}
export function makeSitlFrame(sequence: number, timeUs: number, state: StateLike,
  input: { roll: number; pitch: number; yaw: number }, bodySpecificForce: VectorLike,
  armed: boolean, angle: boolean): SitlFrame {
  const ned = (v: VectorLike): [number, number, number] => [-v.z, v.x, -v.y];
  const q = state.quaternion;
  return { sequence, timeUs, positionNed: ned(state.position), velocityNed: ned(state.velocity),
    quaternionWxyz: [q.w, -q.z, q.x, -q.y], gyroFrd: ned(state.angularVelocity),
    specificForceFrd: ned(bodySpecificForce), rc: { roll: input.roll, pitch: input.pitch,
      yaw: input.yaw, throttle: state.throttle, armed, angle } };
}
export class SitlClient {
  status: SitlStatus = 'disconnected'; error = ''; actuators: number[] | null = null;
  private socket: WebSocket | null = null;
  private closingSocket: WebSocket | null = null;
  private expected: number | null = null;
  private responseSequence = -1;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private sessionNumber = 0;
  constructor(private readonly onUpdate?: (event: SitlEvent) => void) {}
  get session() { return this.sessionNumber; }
  get pending() { return this.expected !== null; }
  connect(protocol: SitlProtocol) {
    const previous = this.detach(); this.error = ''; this.status = 'connecting';
    const session = this.sessionNumber;
    this.timer = setTimeout(() => this.fail('Local SITL connection timed out.'), 4000);
    this.emit('connecting');
    // The bridge deliberately admits a single client. Opening a new WebSocket
    // before the old close handshake completes races its client ownership check.
    if (previous && previous.readyState !== 3) {
      previous.onclose = () => {
        if (this.closingSocket === previous) this.closingSocket = null;
        this.open(protocol, session);
      };
    } else this.open(protocol, session);
  }
  private open(protocol: SitlProtocol, session: number) {
    if (this.sessionNumber !== session || this.status !== 'connecting') return;
    let socket: WebSocket;
    try { socket = new WebSocket('ws://127.0.0.1:4190/sitl'); }
    catch { this.fail('Local SITL WebSocket could not be created.'); return; }
    this.socket = socket;
    socket.onopen = () => { if (this.socket === socket) socket.send(JSON.stringify({ type: 'connect', protocol })); };
    socket.onmessage = event => {
      if (this.socket !== socket) return;
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ready') { this.clearTimer(); this.status = 'ready'; this.emit('ready'); }
        else if (message.type === 'error') this.fail(String(message.message));
        else if (message.type === 'disconnected') this.disconnect();
        else if (message.type === 'actuators') {
          if (message.sequence !== this.expected || !Array.isArray(message.motors) || message.motors.length !== 4 ||
              message.motors.some((v: unknown) => typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v > 1)) return;
          this.clearTimer(); this.actuators = message.motors; this.responseSequence = message.sequence;
          this.expected = null; this.status = 'active'; this.emit('actuators');
        }
      } catch { this.fail('Invalid local bridge response.'); }
    };
    socket.onerror = () => { if (this.socket === socket) this.fail('Local SITL bridge unavailable. Start the bridge and selected firmware.'); };
    socket.onclose = () => { if (this.socket === socket) this.fail('Local SITL connection closed.'); };
  }
  sendFrame(frame: SitlFrame): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.pending ||
        !['ready', 'active'].includes(this.status)) return false;
    this.expected = frame.sequence; this.actuators = null; this.status = 'waiting';
    this.socket.send(JSON.stringify({ type: 'frame', frame }));
    this.timer = setTimeout(() => this.fail('Firmware stopped responding. Simulation halted.'), 3000);
    return true;
  }
  readActuators(sequence: number): number[] | null {
    return this.responseSequence === sequence && this.status === 'active' ? this.actuators?.slice() ?? null : null;
  }
  disconnect() {
    this.detach(); this.status = 'disconnected'; this.emit('disconnected');
  }
  private detach() {
    this.sessionNumber++;
    this.clearTimer(); const old = this.socket ?? this.closingSocket; this.socket = null;
    this.closingSocket = old;
    if (old?.readyState === WebSocket.OPEN) old.send(JSON.stringify({ type: 'disconnect' }));
    old?.close(); if (old?.readyState === 3) this.closingSocket = null;
    this.expected = null; this.responseSequence = -1; this.actuators = null; this.status = 'disconnected';
    return old;
  }
  private fail(message: string) { this.detach(); this.error = message; this.status = 'error'; this.emit('error'); }
  private emit(type: SitlEvent['type']) { this.onUpdate?.({ type, session: this.sessionNumber }); }
  private clearTimer() { if (this.timer) clearTimeout(this.timer); this.timer = null; }
}
