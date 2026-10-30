/** Every asynchronous publisher owns a channel. Abort and identity checks are both required. */
export class LayoutJobChannel {
  private active: { key: string; controller: AbortController } | null = null;
  begin(key: string) {
    this.cancel();
    const job = { key, controller: new AbortController() };
    this.active = job;
    return {
      signal: job.controller.signal,
      current: () => this.active === job && !job.controller.signal.aborted,
      finish: () => {
        if (this.active === job) this.active = null;
      },
    };
  }
  cancel() {
    this.active?.controller.abort();
    this.active = null;
  }
}

export type LayoutJob = ReturnType<LayoutJobChannel["begin"]>;
