import { parseLayoutConfigFile, type LayoutConfigFile } from "../schema/layoutConfig";
import { saveLinkedWorkspaceDocument, saveLinkedServedDocument } from "./linkedDocument";
import type { WorkspaceFolder } from "./types";
export async function saveWorkspaceLayout(workspace: WorkspaceFolder, graphPath: string, config: LayoutConfigFile, isCurrent = () => true, reference?: unknown) {
  const document = parseLayoutConfigFile(config);
  return saveLinkedWorkspaceDocument(workspace, graphPath, { kind: "layout", chartType: document.chartType, document, reference }, isCurrent);
}
export async function saveServedLayout(exampleId: string, graphPath: string, config: LayoutConfigFile, reference?: unknown) {
  const document = parseLayoutConfigFile(config);
  return saveLinkedServedDocument(exampleId, graphPath, { kind: "layout", chartType: document.chartType, document, reference });
}
