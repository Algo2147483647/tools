import type { ELK, ElkNode } from "elkjs/lib/elk-api";
import type { CompoundProjection } from "../graph/compoundProjection";
import type { GraphLayoutAppearance } from "../graph/appearance";
import { buildCompoundLocalGraph, type CompoundLocalGraph } from "./compound-local-graph";
import { placeCompoundBoxes, stitchCompoundRoutes, type CompoundBox } from "./compound-routes";
import { estimateTextWidth } from "./text";
import { compoundLayoutCost, measureCompoundRoutes, type RouteMetrics } from "./compound-layout-score";
import { shortenCompoundRoutes } from "./compound-orthogonal-router";

interface Size {
  width: number;
  height: number;
}

interface LayoutCandidate {
  graph: ElkNode;
  children: Map<string, LayoutCandidate>;
  metrics: RouteMetrics;
  cost: number;
}

/** Keep alternatives with different shapes so a parent's decision can change its children's orientation. */
function retainCandidates(candidates: LayoutCandidate[]): LayoutCandidate[] {
  const best = [...candidates].sort((a, b) => a.cost - b.cost)[0];
  const narrow = [...candidates].sort((a, b) => a.graph.width! - b.graph.width! || a.cost - b.cost)[0];
  const short = [...candidates].sort((a, b) => a.graph.height! - b.graph.height! || a.cost - b.cost)[0];
  return [...new Set([best, narrow, short])];
}

function selectedLayouts(root: LayoutCandidate): Map<string, ElkNode> {
  const layouts = new Map<string, ElkNode>();
  const pending = [root];
  while (pending.length) {
    const candidate = pending.pop()!;
    layouts.set(candidate.graph.id, candidate.graph);
    pending.push(...candidate.children.values());
  }
  return layouts;
}

/** Each ELK run sees only one containment level. Child geometry is immutable in its parent run. */
export async function layoutCompoundHierarchy(
  projection: CompoundProjection,
  sizes: Map<string, Size>,
  theme: GraphLayoutAppearance,
  showEdgeLabels: boolean,
  elk: Pick<ELK, "layout">,
) {
  const model = buildCompoundLocalGraph(projection);
  const leafSizes = new Map([...sizes].map(([id, size]) => [model.sceneIds.get(id)!, size]));
  const cache = new Map<string, ElkNode>();
  const run = async () => {
    const alternatives = new Map<string, LayoutCandidate[]>();
    for (const scopeId of [...model.order].reverse()) {
      const scope = model.scopes.get(scopeId)!;
      const isRoot = scopeId === model.rootId;
      const minimum = leafSizes.get(scopeId);
      const candidates: LayoutCandidate[] = [];
      // Bounded search: two directions and balanced/narrow/short child choices. Containers also
      // compare centered placement with port-aligned placement, which can otherwise form a staircase.
      // At most twelve local layouts; identical inputs are cached and three alternatives survive.
      const tried = new Set<string>();
      for (const direction of ["RIGHT", "DOWN"] as const) {
        for (const placement of scope.children.some((id) => model.scopes.has(id))
          ? ["SIMPLE", "BRANDES_KOEPF"]
          : ["BRANDES_KOEPF"]) {
          for (const preference of ["balanced", "narrow", "short"] as const) {
            const chosen = new Map<string, LayoutCandidate>();
            for (const childId of scope.children) {
              const options = alternatives.get(childId);
              if (!options) continue;
              chosen.set(
                childId,
                [...options].sort((a, b) => {
                  if (preference === "narrow") return a.graph.width! - b.graph.width! || a.cost - b.cost;
                  if (preference === "short") return a.graph.height! - b.graph.height! || a.cost - b.cost;
                  return a.cost - b.cost;
                })[0],
              );
            }
            const graph: ElkNode = {
              id: scopeId,
              x: 0,
              y: 0,
              layoutOptions: {
                "elk.algorithm": "layered",
                "elk.direction": direction,
                "elk.hierarchyHandling": "SEPARATE_CHILDREN",
                "elk.edgeRouting": "ORTHOGONAL",
                "elk.padding": isRoot ? "[top=36,left=36,bottom=36,right=36]" : "[top=58,left=24,bottom=24,right=24]",
                "elk.spacing.nodeNode": String(theme.rowGap),
                "elk.spacing.componentComponent": String(theme.rowGap),
                "elk.spacing.edgeNode": "12",
                "elk.spacing.edgeEdge": "10",
                "elk.spacing.portPort": "12",
                "elk.layered.spacing.nodeNodeBetweenLayers": String(
                  direction === "RIGHT" ? theme.columnGap : theme.rowGap,
                ),
                "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
                "elk.layered.nodePlacement.strategy": placement,
                "elk.separateConnectedComponents": "true",
                "elk.aspectRatio": "1.6",
                "elk.portConstraints": "FIXED_ORDER",
                "elk.nodeSize.constraints": "MINIMUM_SIZE",
                "elk.nodeSize.minimum": isRoot ? "(0,0)" : `(${Math.max(260, minimum?.width ?? 0)},120)`,
                "elk.randomSeed": "1",
              },
              ports: scope.ports.map((port) => ({
                id: port.id,
                width: 0,
                height: 0,
                layoutOptions: { "elk.port.side": port.side, "elk.port.index": String(port.order) },
              })),
              children: scope.children.map((id) => {
                const child = chosen.get(id)?.graph;
                const size = child ?? leafSizes.get(id)!;
                return {
                  id,
                  width: size.width,
                  height: size.height,
                  ...(child
                    ? {
                        // Do not pass children to the parent layout: it must treat this as a fixed rectangle.
                        ports: child.ports?.map((port) => ({ ...port, layoutOptions: { ...port.layoutOptions } })),
                        layoutOptions: { "elk.portConstraints": "FIXED_POS", "elk.nodeSize.constraints": "[]" },
                      }
                    : {}),
                };
              }),
              edges: scope.segments.map((segment) => ({
                id: segment.id,
                sources: [segment.source],
                targets: [segment.target],
                labels:
                  showEdgeLabels && segment.label
                    ? [
                        {
                          text: segment.label,
                          width: Math.max(segment.label.length * 7 + 12, estimateTextWidth(segment.label, 10) + 14),
                          height: 18,
                        },
                      ]
                    : [],
              })),
            };
            const fingerprint = JSON.stringify(graph);
            if (tried.has(fingerprint)) continue;
            tried.add(fingerprint);
            // ELK's external ports require a parent graph, even for a standalone local layout.
            // The fixed wrapper provides that context without laying out any other hierarchy level.
            let laidOut = cache.get(fingerprint);
            if (!laidOut) {
              const result = await elk.layout({
                id: "local-wrapper",
                layoutOptions: { "elk.algorithm": "fixed", "elk.hierarchyHandling": "SEPARATE_CHILDREN" },
                children: [graph],
              });
              laidOut = result.children![0];
              cache.set(fingerprint, laidOut);
            }
            const metrics = measureCompoundRoutes(
              laidOut,
              [...chosen.values()].map((candidate) => candidate.metrics),
            );
            const bounds = isRoot
              ? {
                  ...laidOut,
                  width: Math.max(laidOut.width ?? 0, theme.stageMinWidth),
                  height: Math.max(laidOut.height ?? 0, theme.stageMinHeight),
                }
              : laidOut;
            candidates.push({ graph: laidOut, children: chosen, metrics, cost: compoundLayoutCost(bounds, metrics) });
          }
        }
      }
      alternatives.set(scopeId, retainCandidates(candidates));
    }
    return alternatives.get(model.rootId)![0];
  };
  let best = await run();
  // At most one refinement pass. Order boundary ports using the first pass's external neighbors.
  // Re-layout only changed scopes and ancestors whose child sizes/ports changed.
  const first = placeCompoundBoxes(model, selectedLayouts(best));
  if (refineBoundaryPorts(model, first.boxes)) {
    const refined = await run();
    // Port refinement is optional; retain the first complete solution if it scores better.
    if (refined.cost < best.cost) best = refined;
  }
  const layouts = selectedLayouts(best);
  const { boxes: sceneBoxes, offsets } = placeCompoundBoxes(model, layouts);
  const boxes = new Map([...model.sceneIds].map(([id, sceneId]) => [id, sceneBoxes.get(sceneId)!]));
  const root = layouts.get(model.rootId)!;
  return {
    boxes,
    routes: shortenCompoundRoutes(
      projection,
      boxes,
      stitchCompoundRoutes(model, layouts, offsets),
      { x: 0, y: 0, width: root.width ?? 0, height: root.height ?? 0 },
      showEdgeLabels,
    ),
    width: root.width ?? 0,
    height: root.height ?? 0,
  };
}

function refineBoundaryPorts(model: CompoundLocalGraph, boxes: Map<string, CompoundBox>): boolean {
  let changed = false;
  for (const scope of model.scopes.values()) {
    if (!scope.ports.length) continue;
    const own = boxes.get(scope.id)!;
    for (const port of scope.ports) {
      const other = boxes.get(model.sceneIds.get(port.oppositeId)!)!;
      const side =
        other.y >= own.y + own.height ? "SOUTH" : other.x + other.width / 2 < own.x + own.width / 2 ? "WEST" : "EAST";
      if (port.side !== side) changed = true;
      port.side = side;
    }
    const sorted = [...scope.ports].sort((a, b) => {
      if (a.side !== b.side) return a.side < b.side ? -1 : 1;
      const oppositeA = boxes.get(model.sceneIds.get(a.oppositeId)!)!;
      const oppositeB = boxes.get(model.sceneIds.get(b.oppositeId)!)!;
      // ELK indexes ports clockwise: east is top-to-bottom; south and west run in reverse.
      const positionA = a.side === "SOUTH" ? oppositeA.x + oppositeA.width / 2 : oppositeA.y + oppositeA.height / 2;
      const positionB = b.side === "SOUTH" ? oppositeB.x + oppositeB.width / 2 : oppositeB.y + oppositeB.height / 2;
      return (a.side === "EAST" ? 1 : -1) * (positionA - positionB) || a.order - b.order;
    });
    sorted.forEach((port, index) => {
      if (port.order !== index) changed = true;
      port.order = index;
    });
  }
  return changed;
}
