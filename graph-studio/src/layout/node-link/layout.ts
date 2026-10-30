import { getSankeyError } from "../../graph/sankey";
import { buildSankeyStage } from "../sankey/layout";
import type { StageData } from "../shared/types";
import { prepareNodeLinkInput, type NodeLinkLayoutInput, type PreparedNodeLink } from "./input";
import { buildNodeLinkNodes } from "./nodes";
import { positionNodeLinkNodes } from "./position";
import { assembleNodeLinkStage } from "./stage";
export function buildStageData(input: NodeLinkLayoutInput): StageData | null {
  const prepared = prepareNodeLinkInput(input);
  return prepared ? solveFlatLayout(prepared) : null;
}
export function solveFlatLayout(prepared: PreparedNodeLink): StageData {
  const { sourceDag, layoutMode, appearance, selection, reachable, visualByKey } = prepared;
  if (layoutMode === "sankey") {
    const error = getSankeyError(sourceDag.nodes, sourceDag.edges);
    if (error) {
      throw new Error(error);
    }
    return buildSankeyStage(sourceDag, reachable, selection, visualByKey, appearance);
  }

  const nodes = buildNodeLinkNodes(prepared);
  return assembleNodeLinkStage(prepared, nodes, positionNodeLinkNodes(prepared, nodes));
}
