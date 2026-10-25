import type { GraphChartType } from "../graph/types";
import type { ChartStyle } from "../schema/appearance/types";
import { createStyleDocument } from "../schema/styleProtocol";
import { saveLinkedWorkspaceDocument, saveLinkedServedDocument } from "./linkedDocument";
import type { WorkspaceFolder } from "./types";
export async function saveWorkspaceStyle(workspace: WorkspaceFolder, graphPath: string, chartType: GraphChartType, style: ChartStyle, isCurrent = () => true, reference?: unknown) {
  return saveLinkedWorkspaceDocument(workspace, graphPath, { kind: "style", chartType, document: createStyleDocument(chartType, style), reference }, isCurrent);
}
export async function saveServedStyle(exampleId: string, graphPath: string, chartType: GraphChartType, style: ChartStyle, reference?: unknown) {
  return saveLinkedServedDocument(exampleId, graphPath, { kind: "style", chartType, document: createStyleDocument(chartType, style), reference });
}
