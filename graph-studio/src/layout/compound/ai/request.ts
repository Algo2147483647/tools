import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { LayoutProblem } from "../layout-plan";
import { measureLayout } from "../layout-quality";
import { routingHotspots } from "../diagnostics";
import { requestLayoutPlan } from "../../shared/ai/request";
import type { LayoutDirection } from "../../../graph/compound/layoutData";
import type { LayoutResultDocument } from "../../../schema/layoutResult";
import { layoutDecisionSchema, parseLayoutDecision } from "../../shared/ai/decision";
import { COMPOUND_PLANNER_INSTRUCTIONS } from "./prompt";

export function compoundAiContext(problem: LayoutProblem) {
  const nodes = [...problem.projection.items].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = problem.projection.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const edgeIds = new Set(edges.flatMap((e) => e.originalEdgeIds));
  const hotspots = routingHotspots(problem);
  const filterHotspots = <T extends { edgeIds: string[] }>(entries: T[]) =>
    entries
      .map((entry) => ({ ...entry, edgeIds: entry.edgeIds.filter((id) => edgeIds.has(id)) }))
      .filter((entry) => entry.edgeIds.length);
  return {
    edgeIds,
    context: {
      scopeId: problem.projection.focusGroupId,
      direction: problem.stored.direction,
      objective: problem.stored.objective,
      portMode: problem.stored.portMode,
      coordinateSystem: {
        units: "px",
        positions: "absolute canvas pixels; node centers and group top-left corners",
        groupPadding: { left: 24, top: 58, right: 24, bottom: 24 },
      },
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.title,
        parentId: n.parentId,
        external: n.external,
        collapsed: n.collapsed,
        kind: n.kind,
        semanticType: problem.nodeSemantics?.[n.id]?.type,
        description: problem.nodeSemantics?.[n.id]?.description,
        size: { width: problem.baseline.boxes[n.id].width, height: problem.baseline.boxes[n.id].height },
        minimumSize: problem.minimumSizes[n.id],
      })),
      edges: edges
        .filter((e) => e.originalEdgeIds.some((id) => edgeIds.has(id)))
        .map((e) => ({
          source: e.source,
          target: e.target,
          id: e.id,
          ids: e.originalEdgeIds.filter((id) => edgeIds.has(id)),
          label: e.label,
          relativePosition: (() => {
            const a = problem.baseline.boxes[e.source],
              b = problem.baseline.boxes[e.target];
            const dx = b.x + b.width / 2 - a.x - a.width / 2,
              dy = b.y + b.height / 2 - a.y - a.height / 2;
            return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
          })(),
        })),
      truncated: false,
      quality: measureLayout(problem, problem.baseline),
      crossings: filterHotspots(hotspots.crossings),
      sharedRuns: filterHotspots(hotspots.sharedRuns),
      detours: filterHotspots(hotspots.detours),
      crowdedPorts: filterHotspots(hotspots.crowdedPorts),
      groupConnections: filterHotspots(hotspots.groupConnections),
      containerPassages: filterHotspots(hotspots.containerPassages),
      diagnosticsTruncated: hotspots.truncated,
    },
  };
}

export function requestCompoundLayoutDecision(
  settings: AiSettings,
  problem: LayoutProblem,
  message: string,
  signal: AbortSignal,
  onRetry: (() => void) | undefined,
  session: {
    observations: unknown[];
    selectedDirection: LayoutDirection;
    candidateIds: ReadonlySet<string>;
    currentLayout: LayoutResultDocument;
    requireEvaluation: boolean;
    onProgress?: AiProgressListener;
  },
) {
  const { context } = compoundAiContext(problem);
  const selectedDirection = session.selectedDirection;
  return requestLayoutPlan({
    settings,
    context: {
      ...context,
      selectedDirection,
      currentLayout: session.currentLayout,
      session: {
        observations: session.observations,
        selectableCandidates: [...session.candidateIds],
      },
    },
    message,
    signal,
    schema: layoutDecisionSchema("compound"),
    purpose: "layout-planning",
    onProgress: session.onProgress,
    onRetry,
    instructions: COMPOUND_PLANNER_INSTRUCTIONS,
    parse: (value) => parseLayoutDecision(value, "compound", session.candidateIds, session.requireEvaluation),
  });
}
