import { roundedPolylinePath } from "../shared/rounded-path";
import type { StageData } from "../shared/types";
import type { LayoutSnapshot } from "./layout-plan";

/** Stage nodes use centers; snapshot and group rectangles use top-left coordinates. */
export function applyLayoutSnapshot(stage: StageData, snapshot: LayoutSnapshot): StageData {
  const nodeMap: StageData["nodeMap"] = Object.create(null);
  for (const [id, node] of Object.entries(stage.nodeMap)) {
    const box = snapshot.boxes[id];
    nodeMap[id] = box ? { ...node, ...box, x: box.x + box.width / 2, y: box.y + box.height / 2 } : node;
  }
  return {
    ...stage,
    nodeMap,
    nodes: stage.nodes.map((n) => nodeMap[n.key]),
    groups: stage.groups?.map((group) => ({ ...group, ...snapshot.boxes[group.id] })),
    edges: stage.edges.map((edge) => {
      const route = snapshot.routes[edge.id];
      return route
        ? {
            ...edge,
            points: route.points.map((p, order) => ({ ...p, layer: 0, order })),
            path: roundedPolylinePath(route.points),
            labelPosition: route.labelPosition,
          }
        : edge;
    }),
    stageWidth: snapshot.width,
    stageHeight: snapshot.height,
  };
}
