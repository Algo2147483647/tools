import type { GraphChartType, NormalizedDag } from "../graph/types";
import { isRecord } from "../shared/json";
import { parseChartStyleFile } from "../schema/styleProtocol";
import type { ChartStyle } from "../schema/appearance/styles";
import { readWorkspaceFile } from "./browserAccess";
import { resolveWorkspacePath } from "./paths";
import type { WorkspaceFolder } from "./types";

/** Resolve only files already granted by the opened workspace. Never fetch URLs. */
export async function readLinkedStyle(
  dag: NormalizedDag,
  graphPath: string,
  folder?: WorkspaceFolder,
): Promise<{ linkedStyle?: ChartStyle; linkedChartType?: GraphChartType; styleNotice?: string }> {
  const reference = dag.metadata?.style;
  if (reference === undefined) return {};
  try {
    if (typeof reference !== "string" || !reference.trim() || /[?#]/.test(reference))
      throw new Error("metadata.style must be a relative JSON file path.");
    const path = resolveWorkspacePath(reference, graphPath);
    if (!/\.json$/i.test(path)) throw new Error("Style files must use the .json extension.");
    if (!folder) throw new Error("Open the workspace folder to load the linked style.");
    const entry = folder.files.get(path);
    if (!entry) throw new Error(`Style file not found: ${path}`);
    const file = await readWorkspaceFile(entry);
    if (file.size > 16 * 1024 * 1024) throw new Error("Style JSON exceeds the 16 MB limit.");
    const value: unknown = JSON.parse(await file.text());
    if (
      !isRecord(value) ||
      !["node-link", "compound", "timeline", "sankey", "spatial"].includes(String(value.chartType))
    )
      throw new Error("Style JSON must declare a supported chartType.");
    const chartType = value.chartType as GraphChartType;
    return { linkedStyle: parseChartStyleFile(value, chartType), linkedChartType: chartType };
  } catch (error) {
    return { styleNotice: `Linked style unavailable: ${error instanceof Error ? error.message : String(error)}` };
  }
}
