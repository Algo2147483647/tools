import type { GraphChartType } from "../graph/types";
import { writeJsonToHandle } from "../shared/browser/fileAccess";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";
export type LinkedDocumentKind = "style" | "layout";
interface WriteInput { kind: LinkedDocumentKind; chartType: GraphChartType; document: object; reference?: unknown; }
export async function saveLinkedWorkspaceDocument(workspace: WorkspaceFolder, graphPath: string, input: WriteInput, isCurrent = () => true): Promise<{ reference: string; entry: WorkspaceFile }> {
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
  if (replacing) {
    const currentFile = await (await directory.getFileHandle(fileName)).getFile();
    const formats = kind === "layout" ? ["graph-studio-layout", "graph-studio-layout-settings"] : ["graph-studio-style"];
    if (!formats.includes(JSON.parse(await currentFile.text()).format)) throw new Error(`Target is not a ${kind} file.`);
  }
  if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
  const handle = await directory.getFileHandle(fileName, { create: true });
  try {
    await writeJsonToHandle(handle, content);
    if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
  } catch (error) {
    if (!replacing) await directory.removeEntry(fileName);
    throw error;
  }
  return { reference, entry: { path, handle } };
}


export async function saveLinkedServedDocument(exampleId: string, graphPath: string, input: WriteInput): Promise<{ reference: string; entry: WorkspaceFile }> {
  const { kind, document, reference } = input;
  const response = await fetch(`${import.meta.env.BASE_URL}__graph-studio/${kind}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-Graph-Studio": `${kind}-update` },
    body: JSON.stringify({ exampleId, graphPath, reference, document }),
  });
  if (!response.headers.get("content-type")?.includes("application/json")) throw new Error(`This server cannot write ${kind} files beside the graph.`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || `${kind} update failed.`);
  if (typeof result.reference !== "string" || typeof result.path !== "string") throw new Error(`Invalid ${kind} update response.`);
  return { reference: result.reference, entry: { path: result.path, handle: null, file: new File([JSON.stringify(result.document)], result.path.split("/").at(-1)!, { type: "application/json" }) } };
}
