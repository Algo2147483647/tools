import { parseLayoutDocument, repairLayoutDocument, type LayoutDocument } from "../schema/layoutProtocol";
import type { GraphDocument } from "../graph/types";
import { readWorkspaceFile } from "./browserAccess";
import type { GraphWorkspace } from "./types";

export interface LinkedLayout {
  linkedLayout?: LayoutDocument;
  layoutSource?: string;
  layoutNotice?: string;
}

export async function readLinkedLayout(graph: GraphDocument, graphPath: string, workspace?: GraphWorkspace): Promise<LinkedLayout> {
  if (!workspace) return {};
  const explicit = workspace.manifest?.layouts?.[graphPath];
  const path = explicit ?? graphPath.replace(/\.json$/i, ".layout.json");
  const entry = workspace.files.get(path);
  if (!entry && !explicit) return {};
  try {
    if (!entry) throw new Error(`Layout file not found: ${path}`);
    const file = await readWorkspaceFile(entry);
    if (file.size > 16 * 1024 * 1024) throw new Error("Layout exceeds 16 MB.");
    const parsed = parseLayoutDocument(JSON.parse(await file.text()));
    const linkedLayout = repairLayoutDocument(parsed, graph);
    return { linkedLayout, layoutSource: path,
      ...(linkedLayout === parsed ? {} : { layoutNotice: "Layout references missing from this graph were removed." }) };
  } catch (error) {
    return { layoutNotice: `Using default layout. ${error instanceof Error ? error.message : String(error)}` };
  }
}
