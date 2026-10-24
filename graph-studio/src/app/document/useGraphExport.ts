import type { Dispatch } from "react";
import { downloadSvg, prepareHtmlSvg } from "../../export/svg";
import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
import type { GraphViewportController } from "../viewport/useGraphViewport";
export function useGraphExport(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  viewport: Pick<GraphViewportController, "svgRef" | "stage">,
) {
  function exportSvg() {
    if (!viewport.svgRef.current) {
      dispatch({ type: "statusChanged", status: "Render a DAG first, then export the SVG." });
      return;
    }
    downloadSvg(viewport.svgRef.current);
    dispatch({ type: "statusChanged", status: "Exported current view as dag-graph.svg." });
  }
  async function exportHtml() {
    const { stage } = viewport;
    const graph = state.dag;
    const svg = viewport.svgRef.current;
    if (!svg || !stage || !graph) {
      dispatch({ type: "statusChanged", status: "Render a graph first, then export HTML." });
      return;
    }
    try {
      // Snapshot before loading so a later edit or navigation cannot mix document and SVG versions.
      const snapshot = prepareHtmlSvg(svg);
      const { downloadHtml } = await import("../../export/html");
      downloadHtml(snapshot, stage, graph, state.source.fileName);
      dispatch({ type: "statusChanged", status: "Exported current canvas as interactive HTML." });
    } catch (error) {
      dispatch({
        type: "statusChanged",
        status: `HTML export failed: ${error instanceof Error ? error.message : error}`,
      });
    }
  }

  return { exportSvg, exportHtml };
}
