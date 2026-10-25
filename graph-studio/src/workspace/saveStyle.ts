import type { GraphChartType } from "../graph/types";
import type { ChartStyle } from "../schema/appearance/types";
import { serializeChartStyle } from "../schema/styleProtocol";
import { writeJsonToHandle } from "../shared/browser/fileAccess";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFile, WorkspaceFolder } from "./types";

/** Update the linked Schema document, or create one beside the graph for its first binding. */
export async function saveWorkspaceStyle(
  workspace: WorkspaceFolder,
  graphPath: string,
  chartType: GraphChartType,
  style: ChartStyle,
  isCurrent = () => true,
  linkedReference?: unknown,
): Promise<{ reference: string; entry: WorkspaceFile }> {
  const content = serializeChartStyle(chartType, style);
  const graphName = graphPath.split("/").at(-1)!;
  if (
    linkedReference !== undefined &&
    (typeof linkedReference !== "string" || !linkedReference.trim() || /[?#]/.test(linkedReference))
  )
    throw new Error("metadata.style must be a relative JSON file path.");
  let reference = linkedReference as string | undefined;
  const target = reference === undefined ? graphPath : resolveWorkspacePath(reference, graphPath);
  if (
    reference !== undefined &&
    (!/\.json$/i.test(target) || target === graphPath || target.toLowerCase().endsWith("graph-studio.workspace.json"))
  )
    throw new Error("metadata.style must point to a separate style JSON file.");
  const parts = target.split("/");
  let fileName = parts.pop()!;
  let directory = workspace.handle;
  if (!directory || !workspace.files.has(graphPath)) throw new Error("Open a local workspace graph to save its style.");
  if ((await directory.queryPermission?.({ mode: "readwrite" })) !== "granted" && directory.requestPermission) {
    if ((await directory.requestPermission({ mode: "readwrite" })) !== "granted")
      throw new Error("Write access was not granted. The style link was kept unchanged.");
  }
  for (const part of parts) {
    if (!directory.getDirectoryHandle) throw new Error("Workspace folder access is unavailable.");
    directory = await directory.getDirectoryHandle(part);
  }
  if (!directory.getFileHandle || !directory.removeEntry || !directory.entries)
    throw new Error("This browser cannot save workspace style files.");
  const existing = new Set<string>();
  for await (const [name] of directory.entries()) existing.add(name.toLowerCase());
  const stem = `${graphName.replace(/\.json$/i, "")}.${chartType}`;
  let index = 1;
  if (reference === undefined) {
    fileName = `${stem}.style.json`;
    while (existing.has(fileName.toLowerCase())) fileName = `${stem}.${++index}.style.json`;
    reference = fileName;
  }
  const replacing = existing.has(fileName.toLowerCase());
  if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
  const handle = await directory.getFileHandle(fileName, { create: true });
  try {
    await writeJsonToHandle(handle, content);
    if (!isCurrent()) throw new DOMException("Document changed.", "AbortError");
  } catch (error) {
    if (!replacing) await directory.removeEntry(fileName);
    throw error;
  }
  const path = [...parts, fileName].join("/");
  return { reference, entry: { path, handle } };
}

/** Local server-owned examples can write beside their source graph without a file picker. */
export async function saveServedStyle(
  exampleId: string,
  graphPath: string,
  chartType: GraphChartType,
  style: ChartStyle,
  reference?: unknown,
): Promise<{ reference: string; entry: WorkspaceFile }> {
  const response = await fetch(`${import.meta.env.BASE_URL}__graph-studio/style`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Graph-Studio": "style-update" },
    body: JSON.stringify({
      exampleId,
      graphPath,
      reference,
      document: JSON.parse(serializeChartStyle(chartType, style)),
    }),
  });
  if (!response.headers.get("content-type")?.includes("application/json"))
    throw new Error("This server cannot write style files beside the graph.");
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "Style update failed.");
  if (typeof result.reference !== "string" || typeof result.path !== "string")
    throw new Error("Invalid style update response.");
  return {
    reference: result.reference,
    entry: {
      path: result.path,
      handle: null,
      file: new File([JSON.stringify(result.document)], result.path.split("/").at(-1)!, { type: "application/json" }),
    },
  };
}
