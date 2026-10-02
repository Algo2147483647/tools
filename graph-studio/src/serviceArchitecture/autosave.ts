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
  canUndo: boolean;
  canRedo: boolean;
  presentation: boolean;
}

export interface ChangeOptions {
  /** Consecutive edits to one field coalesce until another action or a brief pause. */
  historyKey?: string;
  /** System migrations still save, but do not create a user undo step. */
  recordHistory?: boolean;
}

function sameContent<T extends { revision: number }>(left: T, right: T): boolean {
  const { revision: _leftRevision, ...a } = left;
  const { revision: _rightRevision, ...b } = right;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Serializes writes and tracks edits independently from the server's revision. */
export class AutosaveController<T extends { revision: number }> {
  private snapshot: AutosaveSnapshot<T> = {
    workspace: null,
    status: 'idle',
    error: null,
    savedAt: null,
    canUndo: false,
    canRedo: false,
    presentation: false,
  };
  private listeners = new Set<() => void>();
  private sequence = 0;
  private savedSequence = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private active: Promise<void> | null = null;
  private past: T[] = [];
  private future: T[] = [];
  private grouping = false;
  private groupedChange = false;
  private lastHistoryKey: string | undefined;
  private lastChangeAt = 0;
  private original: { snapshot: AutosaveSnapshot<T>; past: T[]; future: T[] } | null = null;

  /** Enter only after all real edits have been flushed. Temporary edits never reach save(). */
  enterPresentation = (): T | null => {
    if (this.snapshot.presentation) return this.original!.snapshot.workspace;
    if (this.active || this.sequence !== this.savedSequence || this.snapshot.error)
      throw new Error('Save pending edits before entering presentation mode.');
    this.endHistoryGroup();
    this.original = { snapshot: this.snapshot, past: this.past, future: this.future };
    this.past = [];
    this.future = [];
    this.emit({
      workspace: structuredClone(this.snapshot.workspace),
      presentation: true,
      canUndo: false,
      canRedo: false,
    });
    return this.original.snapshot.workspace;
  };

  exitPresentation = (): void => {
    if (!this.original) return;
    this.cancelTimer();
    const { snapshot, past, future } = this.original;
    this.original = null;
    this.past = past;
    this.future = future;
    this.grouping = false;
    this.groupedChange = false;
    this.lastHistoryKey = undefined;
    this.emit(snapshot);
  };

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
    if (this.snapshot.presentation) throw new Error('Exit presentation mode before changing workspaces.');
    if (this.active || this.sequence !== this.savedSequence)
      throw new Error('Save the current workspace before replacing it.');
    this.cancelTimer();
    this.sequence = 0;
    this.savedSequence = 0;
    this.past = [];
    this.future = [];
    this.grouping = false;
    this.groupedChange = false;
    this.lastHistoryKey = undefined;
    this.emit({
      workspace,
      status: workspace ? 'saved' : 'idle',
      error: null,
      savedAt: null,
      canUndo: false,
      canRedo: false,
    });
  }

  beginHistoryGroup = (): void => {
    this.endHistoryGroup();
    this.grouping = true;
    this.groupedChange = false;
    this.lastHistoryKey = undefined;
  };

  endHistoryGroup = (): void => {
    if (
      this.grouping &&
      this.groupedChange &&
      this.snapshot.workspace &&
      this.past.length &&
      sameContent(this.past[this.past.length - 1], this.snapshot.workspace)
    )
      this.past.pop();
    this.grouping = false;
    this.groupedChange = false;
    this.lastHistoryKey = undefined;
    if (this.snapshot.canUndo !== !!this.past.length) this.emit({ canUndo: !!this.past.length });
  };

  change(updater: (workspace: T) => T, options: ChangeOptions = {}) {
    const previous = this.snapshot.workspace;
    if (!previous) return;
    const workspace = updater(previous);
    if (workspace === previous || sameContent(workspace, previous)) return;
    const now = Date.now();
    const coalesce = this.grouping
      ? this.groupedChange
      : !!options.historyKey && options.historyKey === this.lastHistoryKey && now - this.lastChangeAt < 750;
    if (options.recordHistory !== false && !coalesce) {
      this.past.push(structuredClone(previous));
      if (this.past.length > 100) this.past.shift();
    }
    if (options.recordHistory !== false) this.future = [];
    this.groupedChange = this.grouping && options.recordHistory !== false;
    this.lastHistoryKey = options.historyKey;
    this.lastChangeAt = now;
    this.replace({ ...workspace, revision: previous.revision });
  }

  undo = (): void => {
    this.endHistoryGroup();
    const current = this.snapshot.workspace;
    const previous = this.past.pop();
    if (!current || !previous) return;
    this.future.push(structuredClone(current));
    this.replace({ ...structuredClone(previous), revision: current.revision });
  };

  redo = (): void => {
    this.endHistoryGroup();
    const current = this.snapshot.workspace;
    const next = this.future.pop();
    if (!current || !next) return;
    this.past.push(structuredClone(current));
    this.replace({ ...structuredClone(next), revision: current.revision });
  };

  private replace(workspace: T) {
    if (this.snapshot.presentation) {
      this.emit({ workspace, canUndo: !!this.past.length, canRedo: !!this.future.length });
      return;
    }
    this.sequence++;
    // A failed save needs an explicit Retry. Further edits remain recoverable.
    this.emit({
      workspace,
      status: this.snapshot.error ? 'error' : this.active ? 'saving' : 'pending',
      canUndo: !!this.past.length,
      canRedo: !!this.future.length,
    });
    if (this.snapshot.error || this.active) return;
    this.cancelTimer();
    this.timer = setTimeout(() => {
      void this.flush().catch(() => {});
    }, this.delay);
  }

  /** Resolves after all edits, including those made during a request, are saved. */
  flush = (): Promise<void> => {
    if (this.snapshot.presentation) return Promise.resolve();
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
