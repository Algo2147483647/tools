import type { StageData } from "../shared/types";
import type { LayoutGeometry, LayoutProblem } from "./layout-plan";
import { measureLayout, validateLayoutGeometry } from "./layout-quality";
/** Rebuild solver observations once from the geometry actually rendered. */
export function finalizeCompoundStage(stage: StageData, problem: LayoutProblem | undefined): StageData {
  const { nodes, edges, groups } = stage;
  if (problem) {
    const geometry: LayoutGeometry = {
      width: stage.stageWidth,
      height: stage.stageHeight,
      boxes: Object.fromEntries([
        ...nodes.map(
          (n) => [n.key, { x: n.x - n.width / 2, y: n.y - n.height / 2, width: n.width, height: n.height }] as const,
        ),
        ...(groups ?? []).map((g) => [g.id, { x: g.x, y: g.y, width: g.width, height: g.height }] as const),
      ]),
      routes: Object.fromEntries(
        edges.map((e) => [
          e.id,
          { points: (e.points ?? []).map((p) => ({ x: p.x, y: p.y })), labelPosition: e.labelPosition },
        ]),
      ),
    };
    stage.compoundLayout = { ...problem, baseline: geometry };
    stage.layoutQuality = {
      metrics: measureLayout(stage.compoundLayout, geometry),
      validation: validateLayoutGeometry(stage.compoundLayout, geometry),
      elapsedMs: 0,
    };
  }
  return stage;
}
