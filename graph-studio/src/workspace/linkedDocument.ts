import type { GraphChartType } from "../graph/types";
import { writeJsonToHandle } from "../shared/browser/fileAccess";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";
import { bindLayoutReference } from "./layoutAssociation";
import { normalizeDagInput } from "../graph/normalize";
import type { NormalizedDag } from "../graph/types";
export type LinkedDocumentKind = "style" | "layout";
export interface SavedLinkedDocument {
  reference: string;
  entry: WorkspaceFile;
  graphEntry?: WorkspaceFile;
  persistedDag?: NormalizedDag;
}
interface WriteInput {
  kind: LinkedDocumentKind;
  chartType: GraphChartType;
  document: object;
  reference?: unknown;
}
export async function saveLinkedWorkspaceDocument(
  workspace: WorkspaceFolder,
  graphPath: string,
  input: WriteInput,
  isCurrent = () => true,
): Promise<SavedLinkedDocument> {
  const { kind, chartType, reference: linkedReference } = input;
  const content = JSON.stringify(input.document, null, 2);
  const graphName = graphPath.split("/").at(-1)!;
  if (
    linkedReference !== undefined &&
    (typeof linkedReference !== "string" || !linkedReference.trim() || /[?#]/.test(linkedReference))
  )
    throw new Error(`metadata.${kind} must be a relative JSON file path.`);
  let reference = linkedReference as string | undefined;
  const target = reference === undefined ? graphPath : resolveWorkspacePath(reference, graphPath);
  if (
    reference !== undefined &&
    (!/\.json$/i.test(target) || target === graphPath || target.toLowerCase().endsWith("graph-studio.workspace.json"))
  )
    throw new Error(`metadata.${kind} must point to a separate ${kind} JSON file.`);
  const parts = target.split("/");
  let fileName = parts.pop()!;
  let directory = workspace.handle;
  if (!directory || !workspace.files.has(graphPath))
    throw new Error(`Open a local workspace graph to save its ${kind}.`);
  if ((await directory.queryPermission?.({ mode: "readwrite" })) !== "granted" && directory.requestPermission) {
    if ((await directory.requestPermission({ mode: "readwrite" })) !== "granted")
      throw new Error("Write access was not granted.");
  }
  for (const part of parts) {
    if (!directory.getDirectoryHandle) throw new Error("Workspace folder access is unavailable.");
    directory = await directory.getDirectoryHandle(part);
  }
  if (!directory.getFileHandle || !directory.removeEntry || !directory.entries)
    throw new Error("This browser cannot save workspace files.");
  const existing = new Set<string>();
  for await (const [name] of directory.entries()) existing.add(name.toLowerCase());
  const stem = `${graphName.replace(/\.json$/i, "")}.${chartType}`;
  let index = 1;
  if (reference === undefined) {
    fileName = `${stem}.${kind}.json`;
    while (existing.has(fileName.toLowerCase())) fileName = `${stem}.${++index}.${kind}.json`;
    reference = fileName;
  }
  const replacing = existing.has(fileName.toLowerCase());
  const path = [...parts, fileName].join("/");
  let previousContent: string | undefined;
  if (replacing) {
    const currentFile = await (await directory.getFileHandle(fileName)).getFile();
    previousContent = await currentFile.text();
    const formats =
      kind === "layout" ? ["graph-studio-layout", "graph-studio-layout-settings"] : ["graph-studio-style"];
    if (!formats.includes(JSON.parse(previousContent).format)) throw new Error(`Target is not a ${kind} file.`);
  }
  const graphHandle = workspace.files.get(graphPath)?.handle;
  if (kind === "layout" && !graphHandle)
    throw new Error("Graph write access is required to persist its layout association.");
  const graph =
    kind === "layout" ? bindLayoutReference(await (await graphHandle!.getFile()).text(), reference) : undefined;
  const persistedDag = graph ? normalizeDagInput(graph) : undefined;
  if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
  const handle = await directory.getFileHandle(fileName, { create: true });
  try {
    await writeJsonToHandle(handle, content);
    if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
    if (graph) await writeJsonToHandle(graphHandle!, JSON.stringify(graph, null, 2));
  } catch (error) {
    if (!replacing) await directory.removeEntry(fileName);
    else await writeJsonToHandle(handle, previousContent!);
    throw error;
  }
  return {
    reference,
    entry: { path, handle },
    persistedDag,
    graphEntry: graph ? { path: graphPath, handle: graphHandle! } : undefined,
  };
}

export async function saveLinkedServedDocument(
  exampleId: string,
  graphPath: string,
  input: WriteInput,
): Promise<SavedLinkedDocument> {
  const { kind, document, reference } = input;
  const response = await fetch(`${import.meta.env.BASE_URL}__graph-studio/${kind}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Graph-Studio": `${kind}-update` },
    body: JSON.stringify({ exampleId, graphPath, reference, document }),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error(`This server cannot write ${kind} files beside the graph.`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${kind} update failed.`);
  if (typeof result.reference !== "string" || typeof result.path !== "string")
    throw new Error(`Invalid ${kind} update response.`);
  const entry = (path: string, document: unknown): WorkspaceFile => ({
    path,
    handle: null,
    file: new File([JSON.stringify(document)], path.split("/").at(-1)!, { type: "application/json" }),
  });
  if (kind === "layout" && !result.graph) throw new Error("The server did not persist the graph's layout association.");
  return {
    reference: result.reference,
    entry: entry(result.path, result.document),
    graphEntry: result.graph ? entry(graphPath, result.graph) : undefined,
    persistedDag: result.graph ? normalizeDagInput(result.graph) : undefined,
  };
}
