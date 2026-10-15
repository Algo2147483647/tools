export interface OperationContext {
  isCurrent(): boolean;
}
export interface WorkspaceOperationPorts {
  busy(value: boolean): void;
  notice(message: string): void;
  generation(): number;
}

// One lock for all workspace mutations; disposal and document switches invalidate
// pending results. Recents are deliberately outside this operation lifecycle.
export function createWorkspaceOperations(ports: WorkspaceOperationPorts) {
  let locked = false;
  let epoch = 0;
  return {
    isBusy: () => locked,
    invalidate() {
      epoch++;
    },
    async run<T>(action: (context: OperationContext) => Promise<T>): Promise<T | undefined> {
      if (locked) return undefined;
      locked = true;
      const token = epoch;
      const generation = ports.generation();
      const isCurrent = () => token === epoch && generation === ports.generation();
      ports.busy(true);
      ports.notice("");
      try {
        return await action({ isCurrent });
      } catch (error) {
        if (isCurrent() && !(error instanceof Error && error.name === "AbortError"))
          ports.notice(error instanceof Error ? error.message : String(error));
      } finally {
        locked = false;
        if (token === epoch) ports.busy(false);
      }
    },
  };
}

export async function openPreparedDocument<T>(
  context: OperationContext,
  prepare: () => Promise<T>,
  mayReplace: () => boolean,
  commit: (candidate: T) => void,
  remember: (candidate: T) => void,
): Promise<boolean> {
  const candidate = await prepare();
  if (!context.isCurrent() || !mayReplace()) return false;
  commit(candidate);
  remember(candidate);
  return true;
}
