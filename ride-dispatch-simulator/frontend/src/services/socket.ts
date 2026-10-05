export type ConnectionStatus = 'connecting' | 'connected' | 'reconnecting';
type SocketLike = Pick<WebSocket, 'onopen' | 'onmessage' | 'onerror' | 'onclose' | 'close'>;
export const reconnectDelay = (attempt: number) => Math.min(15000, 500 * 2 ** Math.min(attempt, 5));

/** Transport only. A connection is live after its first valid server payload. */
export class ReconnectingSocket {
  private socket: SocketLike | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = false;
  private attempt = 0;
  constructor(
    private url: string,
    private onMessage: (data: unknown, reconnected: boolean) => boolean,
    private onStatus: (status: ConnectionStatus) => void,
    private factory: (url: string) => SocketLike = (url) => new WebSocket(url),
  ) {
    this.connect(false);
  }
  private connect(reconnected: boolean) {
    if (this.stopped) return;
    this.onStatus(reconnected ? 'reconnecting' : 'connecting');
    let socket: SocketLike;
    try {
      socket = this.factory(this.url);
    } catch {
      this.retry();
      return;
    }
    this.socket = socket;
    let first = true;
    socket.onmessage = (event) => {
      if (this.stopped || this.socket !== socket) return;
      try {
        if (this.onMessage(JSON.parse(String(event.data)), first && reconnected)) {
          first = false;
          this.attempt = 0;
          this.onStatus('connected');
        }
      } catch {
        /* Invalid frames do not replace the last authoritative snapshot. */
      }
    };
    socket.onerror = () => socket.close();
    socket.onclose = () => {
      if (this.stopped || this.socket !== socket) return;
      this.retry();
    };
  }
  private retry() {
    this.onStatus('reconnecting');
    this.timer = setTimeout(() => this.connect(true), reconnectDelay(this.attempt++));
  }
  close() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.socket?.close();
  }
}
