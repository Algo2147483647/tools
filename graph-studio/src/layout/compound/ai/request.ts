import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { LayoutProblem } from "../layout-plan";
import { measureLayout } from "../layout-quality";
import { routingHotspots } from "../diagnostics";
import { requestLayoutPlan } from "../../shared/ai/request";
import { COMPOUND_AGENT_SCHEMA, parseCompoundAiDecision, type CompoundAiPolicy } from "./protocol";
import { buildScopes } from "../constraints";
import { COMPOUND_PLANNER_INSTRUCTIONS } from "./prompt";
import { contentOrigin } from "../precise";

export function compoundAiContext(problem: LayoutProblem) {
  const nodes = [...problem.projection.items]
    .sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id))
    .slice(0, 160);
  const ids = new Set(nodes.map((n) => n.id));
  const edges = problem.projection.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).slice(0, 240);
  const edgeIds = new Set(edges.flatMap((e) => e.originalEdgeIds).slice(0, 240));
  const hotspots = routingHotspots(problem);
  const scopes = new Map(
    [...buildScopes(problem.projection).scopes]
      .filter(([id, scope]) => (id === null || ids.has(id)) && scope.children.every((id) => ids.has(id)))
      .map(([id, scope]) => [
        id ?? problem.projection.focusGroupId,
        {
          nodeIds: scope.children,
          orderable: scope.children.length >= 2 && !nodes.some((n) => scope.children.includes(n.id) && n.external),
        },
      ]),
  );
  const filterHotspots = <T extends { edgeIds: string[] }>(entries: T[]) =>
    entries
      .slice(0, 12)
      .map((entry) => ({ ...entry, edgeIds: entry.edgeIds.filter((id) => edgeIds.has(id)) }))
      .filter((entry) => entry.edgeIds.length);
  const activeConstraints = problem.stored.constraints.filter((c) =>
    "scopeId" in c ? scopes.has(c.scopeId) : edgeIds.has(c.edgeId),
  );
  return {
    edgeIds,
    scopes,
    movableNodeIds: new Set(nodes.filter((n) => !n.external).map((n) => n.id)),
    context: {
      scopeId: problem.projection.focusGroupId,
      direction: problem.stored.direction,
      objective: problem.stored.objective,
      portMode: problem.stored.portMode,
      coordinateSystem: {
        units: "px",
        placements: "offset from parent content origin",
        rootOrigin: { x: 36, y: 36 },
        groupPadding: { left: 24, top: 58, right: 24, bottom: 24 },
      },
      editableScopes: [...scopes].map(([scopeId, scope]) => ({ scopeId, ...scope })),
      currentConstraints: activeConstraints,
      nodes: nodes.map((n) => ({
        id: n.id,
        title: n.title.slice(0, 120),
        parentId: n.parentId,
        external: n.external,
        collapsed: n.collapsed,
        kind: n.kind,
        semanticType: problem.nodeSemantics?.[n.id]?.type,
        description: problem.nodeSemantics?.[n.id]?.description,
        size: { width: problem.baseline.boxes[n.id].width, height: problem.baseline.boxes[n.id].height },
        minimumSize: problem.minimumSizes[n.id],
        localPosition: (() => {
          const origin = contentOrigin(n.parentId === null ? undefined : problem.baseline.boxes[n.parentId]);
          return { x: problem.baseline.boxes[n.id].x - origin.x, y: problem.baseline.boxes[n.id].y - origin.y };
        })(),
        position: { x: problem.baseline.boxes[n.id].x, y: problem.baseline.boxes[n.id].y },
      })),
      edges: edges
        .filter((e) => e.originalEdgeIds.some((id) => edgeIds.has(id)))
        .map((e) => ({
          source: e.source,
          target: e.target,
          ids: e.originalEdgeIds.filter((id) => edgeIds.has(id)),
          label: e.label.slice(0, 160),
          relativePosition: (() => {
            const a = problem.baseline.boxes[e.source],
              b = problem.baseline.boxes[e.target];
            const dx = b.x + b.width / 2 - a.x - a.width / 2,
              dy = b.y + b.height / 2 - a.y - a.height / 2;
            return Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? "east" : "west") : dy >= 0 ? "south" : "north";
          })(),
        })),
      truncated:
        nodes.length < problem.projection.items.length ||
        edges.length < problem.projection.edges.length ||
        edgeIds.size < edges.reduce((sum, e) => sum + e.originalEdgeIds.length, 0),
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
    selectedDirection: CompoundAiPolicy["direction"];
    canEvaluate: boolean;
    candidateIds: ReadonlySet<string>;
    evaluationsRemaining: number;
    decisionsRemaining: number;
    onProgress?: AiProgressListener;
  },
) {
  const { edgeIds, scopes, movableNodeIds, context } = compoundAiContext(problem);
  const selectedDirection = session.selectedDirection;
  return requestLayoutPlan({
    settings,
    context: {
      ...context,
      selectedDirection,
      session: {
        observations: session.observations,
        selectableCandidates: [...session.candidateIds],
        canEvaluate: session.canEvaluate,
        evaluationsRemaining: session.evaluationsRemaining,
        decisionsRemaining: session.decisionsRemaining,
      },
    },
    message,
    signal,
    schema: COMPOUND_AGENT_SCHEMA,
    purpose: "layout-planning",
    onProgress: session.onProgress,
    onRetry,
    instructions: COMPOUND_PLANNER_INSTRUCTIONS,
    parse: (value) =>
      parseCompoundAiDecision(
        value,
        {
          direction: selectedDirection,
          edgeIds,
          scopes,
          movableNodeIds,
          scopeId: problem.projection.focusGroupId,
        },
        session,
      ),
  });
}
