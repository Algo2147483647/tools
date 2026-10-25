import { readLayoutConfig } from "../schema/layoutConfig";
import { layoutSessionFromConfig, repairLayoutSession, type LayoutSessionState } from "../schema/layoutSession";
import type { GraphDocument } from "../graph/types";
import { readWorkspaceFile } from "./browserAccess";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFolder } from "./types";

export interface LinkedLayout {
  linkedLayout?: LayoutSessionState;
  layoutNotice?: string;
}

/** Only explicit graph-relative associations inside the granted folder are read. */
export async function readLinkedLayout(
  graph: GraphDocument,
  graphPath: string,
  workspace?: WorkspaceFolder,
): Promise<LinkedLayout> {
  const reference = graph.metadata?.layout;
  if (reference === undefined) return {};
  try {
    if (typeof reference !== "string" || !reference.trim() || /[?#]/.test(reference))
      throw new Error("metadata.layout must be a relative JSON file path.");
    const path = resolveWorkspacePath(reference, graphPath);
    if (!/\.json$/i.test(path)) throw new Error("Layout files must use the .json extension.");
    if (!workspace) throw new Error("Open the workspace folder to load the associated Layout file.");
    const entry = workspace.files.get(path);
    if (!entry) throw new Error(`Layout file not found: ${path}`);
    const file = await readWorkspaceFile(entry);
    const parsed = layoutSessionFromConfig(readLayoutConfig(JSON.parse(await file.text())));
    const linkedLayout = repairLayoutSession(parsed, graph);
    return {
      linkedLayout,
      ...(linkedLayout === parsed
        ? {}
        : { layoutNotice: "Layout references missing from this graph were removed for this session." }),
    };
  } catch (error) {
    return { layoutNotice: `Using default layout. ${error instanceof Error ? error.message : String(error)}` };
  }
}
