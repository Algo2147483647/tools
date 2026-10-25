import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { LayoutProblem } from "../layout-plan";
import { measureLayout } from "../layout-quality";
import { routingHotspots } from "../diagnostics";
import { requestLayoutPlan } from "../../shared/ai/request";
import type { LayoutDirection } from "../../../graph/compound/layoutData";
import type { LayoutResultDocument } from "../../../schema/layoutResult";
import { compoundDecisionSchema, parseCompoundDecision, COMPOUND_AI_PROTOCOL_VERSION } from "./decision";
import type { ProviderReply } from "../../../ai/transport/providerTransport";
import { COMPOUND_PLANNER_INSTRUCTIONS } from "./prompt";

export function compoundAiContext(problem: LayoutProblem) {
  const nodes = [...problem.projection.items].sort((a, b) => a.depth - b.depth || a.id.localeCompare(b.id));
  const ids = new Set(nodes.map((n) => n.id));
  const edges = problem.projection.edges.filter((e) => ids.has(e.source) && ids.has(e.target));
  const edgeIds = new Set(edges.flatMap((e) => e.originalEdgeIds));
  const hotspots = routingHotspots(problem);
  const limit = 12;
  const filterHotspots = <T extends { edgeIds: string[] }>(entries: T[]) =>
    entries
      .map((entry) => ({ ...entry, edgeIds: entry.edgeIds.filter((id) => edgeIds.has(id)) }))
      .filter((entry) => entry.edgeIds.length)
      .slice(0, limit);
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
        })),
      truncated: false,
      quality: measureLayout(problem, problem.baseline),
      crossings: filterHotspots(hotspots.crossings),
      sharedRuns: filterHotspots([...hotspots.sharedRuns].sort((a, b) => b.length - a.length)),
      detours: filterHotspots(hotspots.detours),
      crowdedPorts: filterHotspots(hotspots.crowdedPorts),
      groupConnections: filterHotspots(hotspots.groupConnections),
      containerPassages: filterHotspots(hotspots.containerPassages),
      diagnosticTotals: {
        crossings: hotspots.crossings.length,
        sharedRuns: hotspots.sharedRuns.length,
        detours: hotspots.detours.length,
        crowdedPorts: hotspots.crowdedPorts.length,
        groupConnections: hotspots.groupConnections.length,
        containerPassages: hotspots.containerPassages.length,
      },
      diagnosticsTruncated: [
        hotspots.crossings,
        hotspots.sharedRuns,
        hotspots.detours,
        hotspots.crowdedPorts,
        hotspots.groupConnections,
        hotspots.containerPassages,
      ].some((entries) => entries.length > limit),
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
    drafts: ReadonlyMap<string, number>;
    workingDraft: { candidateId: string; revision: number };
    feedback: unknown;
    budget: { remainingRequests: number; remainingMs: number };
    beforeRequest(): void;
    onReply(reply: ProviderReply): void;
  },
) {
  const { context } = compoundAiContext(problem);
  const selectedDirection = session.selectedDirection;
  return requestLayoutPlan({
    settings,
    context: {
      ...context,
      protocolVersion: COMPOUND_AI_PROTOCOL_VERSION,
      selectedDirection,
      currentLayout: session.currentLayout,
      session: {
        observations: session.observations,
        selectableCandidates: [...session.candidateIds],
        drafts: [...session.drafts].map(([candidateId, revision]) => ({ candidateId, revision })),
        workingDraft: session.workingDraft,
        feedback: session.feedback,
        budget: session.budget,
      },
    },
    message,
    signal,
    schema: compoundDecisionSchema(),
    purpose: "layout-planning",
    onProgress: session.onProgress,
    onRetry,
    beforeRequest: session.beforeRequest,
    onReply: session.onReply,
    instructions: COMPOUND_PLANNER_INSTRUCTIONS,
    parse: (value) => parseCompoundDecision(value, session.candidateIds, session.drafts, session.requireEvaluation),
  });
}
