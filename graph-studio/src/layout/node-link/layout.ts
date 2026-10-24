import { getSankeyError } from "../../graph/sankey";
import { buildSankeyStage } from "../sankey/layout";
import type { StageData } from "../shared/types";
import { buildSpatialStage } from "../spatial/layout";
import { prepareNodeLinkInput, type NodeLinkLayoutInput } from "./input";
import { buildNodeLinkNodes } from "./nodes";
import { positionNodeLinkNodes } from "./position";
import { assembleNodeLinkStage } from "./stage";
export function buildStageData(input: NodeLinkLayoutInput): StageData | null {
  if (input.layoutMode === "spatial") return buildSpatialStage(input);
  const prepared = prepareNodeLinkInput(input);
  if (!prepared) return null;
  const { sourceDag, layoutMode, appearance, selection, reachable, visualByKey } = prepared;
  if (layoutMode === "sankey") {
    const error = getSankeyError(sourceDag.nodes, sourceDag.edges);
    if (error) {
      const fallback = buildStageData({ ...input, layoutMode: "sugiyama" });
      if (fallback) fallback.warnings.unshift(`${error} Showing the layered layout.`);
      return fallback;
    }
    return buildSankeyStage(sourceDag, reachable, selection, visualByKey, appearance);
  }

  const nodes = buildNodeLinkNodes(prepared);
  return assembleNodeLinkStage(prepared, nodes, positionNodeLinkNodes(prepared, nodes));
}
