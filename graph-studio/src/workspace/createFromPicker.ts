import { pickDirectoryHandle } from "../adapters/fileAccess";
import type { NormalizedDag } from "../graph/types";
import { createLocalWorkspace, workspaceFolderName } from "./creation";
import type { OperationContext } from "./operations";
import type { WorkspaceFolder } from "./types";
export async function createWorkspaceFromPicker(
  input: string,
  context: OperationContext,
  ports: {
    currentGraph(): NormalizedDag | null;
    mayReplace(): boolean;
    created(): void;
    notice(message: string): void;
    open(folder: WorkspaceFolder, context: OperationContext, mayReplace: () => boolean): Promise<boolean>;
  },
) {
  const name = workspaceFolderName(input);
  if (!ports.mayReplace()) return;
  const previousDag = ports.currentGraph();
  const parent = await pickDirectoryHandle({ mode: "readwrite", id: "graph-studio-create-workspace" });
  if (!parent) return;
  if (!context.isCurrent() || (ports.currentGraph() !== previousDag && !ports.mayReplace())) return;
  const approvedDag = ports.currentGraph();
  const folder = await createLocalWorkspace(parent, name);
  ports.created();
  const opened = await ports.open(folder, context, () => ports.currentGraph() === approvedDag || ports.mayReplace());
  if (!opened && context.isCurrent())
    ports.notice(`Created "${name}" in "${parent.name}". Use Open workspace to open it when ready.`);
}
