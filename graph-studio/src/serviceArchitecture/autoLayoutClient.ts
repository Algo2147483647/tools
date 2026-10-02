import ELK from 'elkjs/lib/elk-api';
import workerUrl from 'elkjs/lib/elk-worker.min.js?url';
import { autoLayout } from './autoLayout';
import type { Workspace } from './model';

/** The layout engine runs locally in a worker so large graphs don't freeze the editor. */
export async function arrangeWorkspace(workspace: Workspace, graphId: string) {
  const elk = new ELK({ workerUrl });
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      autoLayout(workspace, graphId, (graph) => elk.layout(graph)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('Layout timed out. Your graph has not changed.')), 30_000);
      }),
    ]);
  } finally {
    clearTimeout(timer);
    elk.terminateWorker();
  }
}
