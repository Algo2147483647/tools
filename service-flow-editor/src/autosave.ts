export type SaveStatus = 'idle' | 'saved' | 'pending' | 'saving' | 'error';

export interface SaveResult<T> {
  workspace: T;
  savedAt: string;
}
export interface AutosaveSnapshot<T> {
  workspace: T | null;
  status: SaveStatus;
  error: string | null;
  savedAt: string | null;
}

/** Serializes writes and tracks edits independently from the server's revision. */
export class AutosaveController<T extends { revision: number }> {
  private snapshot: AutosaveSnapshot<T> = { workspace: null, status: 'idle', error: null, savedAt: null };
  private listeners = new Set<() => void>();
  private sequence = 0;
  private savedSequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<void> | null = null;

  constructor(
    private readonly save: (workspace: T) => Promise<SaveResult<T>>,
    private readonly delay = 500,
  ) {}

  getSnapshot = (): AutosaveSnapshot<T> => this.snapshot;
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  private emit(update: Partial<AutosaveSnapshot<T>>) {
    this.snapshot = { ...this.snapshot, ...update };
    for (const listener of this.listeners) listener();
  }

  private cancelTimer() {
    if (this.timer !== undefined) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Call only after flush(): replacement must never discard pending edits. */
  load(workspace: T | null) {
    if (this.active || this.sequence !== this.savedSequence)
      throw new Error('Save the current workspace before replacing it.');
    this.cancelTimer();
    this.sequence = 0;
    this.savedSequence = 0;
    this.emit({ workspace, status: workspace ? 'saved' : 'idle', error: null, savedAt: null });
  }

  change(updater: (workspace: T) => T) {
    const previous = this.snapshot.workspace;
    if (!previous) return;
    const workspace = updater(previous);
    if (workspace === previous) return;
    this.sequence++;
    // A failed save needs an explicit Retry. Further edits remain recoverable.
    this.emit({ workspace, status: this.snapshot.error ? 'error' : this.active ? 'saving' : 'pending' });
    if (this.snapshot.error || this.active) return;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }

  /** Resolves after all edits, including those made during a request, are saved. */
  flush = (): Promise<void> => {
    this.cancelTimer();
    if (this.active) return this.active;
    if (this.snapshot.error) return Promise.reject(new Error(this.snapshot.error));
    if (!this.snapshot.workspace || this.sequence === this.savedSequence) return Promise.resolve();
    this.active = this.drain().finally(() => {
      this.active = null;
    });
    return this.active;
  };

  retry = (): void => {
    if (this.active || !this.snapshot.workspace || this.sequence === this.savedSequence) return;
    this.emit({ error: null, status: 'pending' });
    void this.flush().catch(() => {});
  };

  private async drain() {
    try {
      while (this.snapshot.workspace && this.savedSequence !== this.sequence) {
        const sequence = this.sequence;
        const request = structuredClone(this.snapshot.workspace);
        this.emit({ status: 'saving', error: null });
        const result = await this.save(request);
        this.savedSequence = sequence;
        // Never replace a newer editor state with an older request's response.
        const workspace = { ...this.snapshot.workspace!, revision: result.workspace.revision };
        this.emit({
          workspace,
          savedAt: result.savedAt,
          status: this.savedSequence === this.sequence ? 'saved' : 'saving',
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The workspace could not be saved.';
      this.emit({ status: 'error', error: message });
      throw error;
    }
  }
}
