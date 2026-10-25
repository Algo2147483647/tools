import type { LayoutResultDocument } from "../../../schema/layoutResult";
import type { CompoundAiDecision } from "./decision";
import type { CompoundLayoutData, LayoutConstraint, LayoutProblem } from "../layout-plan";
import { routingPreferences, solveCompoundLayout } from "../layout-solver";
import { routeCompoundEdges } from "../routing/router";
import { sameBox } from "../layout-quality";
import { layoutScopeMembers } from "../constraints";
import { draftGeometry, geometryLayout, inspectDraft, routeIssues, type GeometryIssue } from "./geometry";

export interface CompoundExecutionInput {
  problem: LayoutProblem;
  baseLayout: LayoutResultDocument;
  decision: Exclude<CompoundAiDecision, { action: "finish" }>;
}
export interface CompoundExecutionResult {
  layout: LayoutResultDocument;
  data: CompoundLayoutData;
  precise: boolean;
  reroutedEdgeIds: string[];
  issues: GeometryIssue[];
  error?: string;
}

/** Pure worker operation. Exact evaluations are never silently rerouted. */
export function executeCompoundDecision({
  problem,
  baseLayout,
  decision,
}: CompoundExecutionInput): CompoundExecutionResult {
  let layout = structuredClone(decision.action === "evaluate" ? decision.layout : baseLayout);
  let data: CompoundLayoutData = { ...problem.stored, method: "ai" };
  const reroutedEdgeIds = new Set<string>();
  try {
    if (decision.action === "propose") {
      const intent = structuredClone(decision.intent);
      // The AI protocol uses visible connection IDs. The existing solver uses original IDs.
      intent.constraints = intent.constraints.flatMap<LayoutConstraint>((c) => {
        if (!("edgeId" in c)) return [c];
        const edge = problem.projection.edges.find((e) => e.id === c.edgeId);
        if (!edge) throw new Error(`Unknown visible connection: ${c.edgeId}.`);
        return edge.originalEdgeIds.map((edgeId) => ({ ...c, edgeId }));
      });
      intent.objective = problem.stored.objective;
      if (problem.stored.direction !== "AUTO") {
        if (intent.constraints.some((c) => c.type === "direction" && c.value !== problem.stored.direction))
          throw new Error(`Preserve selected direction ${problem.stored.direction}.`);
        const members = layoutScopeMembers(problem, intent);
        for (const scopeId of [
          problem.projection.focusGroupId,
          ...problem.projection.items.filter((i) => i.kind === "group" && !i.collapsed && !i.external).map((i) => i.id),
        ]) {
          // Only constrain scopes the intent can actually arrange.
          if (
            scopeId === intent.scope.groupId ||
            (scopeId !== null && intent.scope.includeDescendants && members.has(scopeId))
          )
            intent.constraints.push({ type: "direction", scopeId, value: problem.stored.direction, strength: "soft" });
        }
      }
      // Avoid feeding an invalid draft to placement; proposals start from a valid observation.
      const solved = solveCompoundLayout(problem, intent, 2);
      const candidate = solved.candidates[0];
      if (!candidate) throw new Error(solved.diagnostics.join(" ") || "No legal arrangement found.");
      layout = geometryLayout(baseLayout, candidate.geometry);
      data = { ...candidate.data, method: "ai", objective: intent.objective };
      for (const edge of problem.projection.edges)
        if (JSON.stringify(candidate.geometry.routes[edge.id]) !== JSON.stringify(problem.baseline.routes[edge.id]))
          reroutedEdgeIds.add(edge.id);
    } else if (decision.action === "revise") {
      const original = draftGeometry(layout, problem);
      const manual = new Set<string>();
      const requested = new Set<string>();
      const touched = new Set<string>();
      const items = new Map(problem.projection.items.map((i) => [i.id, i]));
      const belongsTo = (id: string, ancestor: string): boolean => {
        let parent = items.get(id)?.parentId;
        while (parent != null) {
          if (parent === ancestor) return true;
          parent = items.get(parent)?.parentId;
        }
        return false;
      };
      for (const change of decision.changes) {
        const key = `${change.type === "replace-route" || change.type === "reroute-edge" ? "route" : change.type}:${change.id}`;
        if (touched.has(key)) throw new Error(`Conflicting changes for ${change.id}.`);
        touched.add(key);
        if (change.type === "reroute-edge" || change.type === "replace-route") {
          const edge = layout.geometry.edges.find((e) => e.id === change.id);
          if (!edge) throw new Error(`Unknown visible connection: ${change.id}.`);
          if (change.type === "reroute-edge") requested.add(change.id);
          else {
            edge.points = change.points;
            edge.label = change.label;
            manual.add(change.id);
          }
          continue;
        }
        if (items.get(change.id)?.external) throw new Error(`External node is fixed: ${change.id}.`);
        if (change.type === "move-node") {
          const node = layout.geometry.nodes.find((n) => n.id === change.id);
          if (!node) throw new Error(`Unknown visible node: ${change.id}.`);
          node.position = change.position;
        } else {
          const group = layout.geometry.groups?.find((g) => g.id === change.id);
          if (!group) throw new Error(`Unknown expanded group: ${change.id}.`);
          if (change.type === "resize-group") group.size = change.size;
          else {
            const dx = change.position[0] - group.position[0],
              dy = change.position[1] - group.position[1];
            for (const member of [...layout.geometry.nodes, ...layout.geometry.groups!]) {
              if (member.id !== change.id && !belongsTo(member.id, change.id)) continue;
              if (items.get(member.id)?.external) throw new Error(`External node is fixed: ${member.id}.`);
              member.position = [member.position[0] + dx, member.position[1] + dy];
            }
          }
        }
      }
      const geometry = draftGeometry(layout, problem);
      const changed = new Set(
        problem.projection.items.filter((i) => !sameBox(original.boxes[i.id], geometry.boxes[i.id])).map((i) => i.id),
      );
      for (const e of problem.projection.edges) if (changed.has(e.source) || changed.has(e.target)) requested.add(e.id);
      // Also invalidate routes obstructed by a moved, unrelated card (and their labels).
      if (changed.size)
        for (const issue of routeIssues(problem, geometry)) if (issue.edgeId) requested.add(issue.edgeId);
      for (const id of manual) requested.delete(id);
      geometry.width = Math.max(geometry.width, ...Object.values(geometry.boxes).map((b) => b.x + b.width + 36));
      geometry.height = Math.max(geometry.height, ...Object.values(geometry.boxes).map((b) => b.y + b.height + 36));
      for (let attempt = 0; requested.size && attempt < 2; attempt++) {
        const fixedRoutes = new Map(Object.entries(geometry.routes).filter(([id]) => !requested.has(id)));
        const preferences = routingPreferences(problem, data);
        const routed = routeCompoundEdges(
          problem.projection,
          new Map(Object.entries(geometry.boxes)),
          { x: 0, y: 0, width: geometry.width, height: geometry.height },
          problem.showLabels,
          {
            fixedRoutes,
            portMode: data.portMode,
            labelSizes: problem.labelSizes,
            reverseOrder: attempt === 1,
            ...preferences,
          },
        );
        geometry.routes = Object.fromEntries(routed.routes);
        geometry.width = routed.width;
        geometry.height = routed.height;
        for (const id of requested) reroutedEdgeIds.add(id);
        requested.clear();
        for (const issue of routeIssues(problem, geometry))
          if (issue.edgeId && !manual.has(issue.edgeId)) requested.add(issue.edgeId);
      }
      layout = geometryLayout(layout, geometry);
    }
    return {
      layout,
      data,
      precise: decision.action === "evaluate",
      reroutedEdgeIds: [...reroutedEdgeIds],
      issues: inspectDraft(layout, { ...problem, stored: data }),
    };
  } catch (error) {
    return {
      layout,
      data,
      precise: decision.action === "evaluate",
      reroutedEdgeIds: [...reroutedEdgeIds],
      issues: inspectDraft(layout, problem),
      error: error instanceof Error ? error.message : "Layout execution failed.",
    };
  }
}
