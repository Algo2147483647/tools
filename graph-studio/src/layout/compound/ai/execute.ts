import type { LayoutResultDocument } from "../../../schema/layoutResult";
import type { LayoutChange } from "./protocol";
import type { CompoundDesign } from "./design";
import type { CompoundLayoutData, LayoutProblem, LayoutIntent } from "../layout-plan";
import { routingPreferences, solveCompoundLayout } from "../layout-solver";
import { routeDesignedEdges } from "../routing/designed";
import { emptyRouting, type RoutingIssue } from "../routing/intent";
import { verifyRoutingIntent } from "../routing/verify";
import { sameBox } from "../layout-quality";
import { executeDesign, validateDesign, validateRequiredAnchors } from "./design";
import { draftGeometry, geometryLayout, inspectDraft, routeIssues, type GeometryIssue } from "./geometry";

export interface CompoundExecutionInput {
  problem: LayoutProblem;
  baseLayout: LayoutResultDocument;
  baseDesign?: CompoundDesign;
  decision:
    | { action: "compose"; design: CompoundDesign }
    | { action: "edit"; changes: LayoutChange[] }
    | { action: "console-intent"; intent: LayoutIntent };
}
export interface CompoundExecutionResult {
  layout: LayoutResultDocument;
  data: CompoundLayoutData;
  reroutedEdgeIds: string[];
  issues: GeometryIssue[];
  error?: string;
  design?: CompoundDesign;
  routingIssues?: RoutingIssue[];
}

/** Pure geometry execution. Manual replacement routes are never silently rerouted. */
export function executeCompoundDecision({
  problem,
  baseLayout,
  baseDesign,
  decision,
}: CompoundExecutionInput): CompoundExecutionResult {
  let layout = structuredClone(baseLayout);
  let data: CompoundLayoutData = { ...problem.stored, method: "ai" };
  const reroutedEdgeIds = new Set<string>();
  let design = baseDesign ? structuredClone(baseDesign) : undefined;
  let routingIssues: RoutingIssue[] = [];
  try {
    if (decision.action === "console-intent") {
      design = undefined;
      const candidate = solveCompoundLayout(problem, decision.intent).candidates[0];
      if (!candidate) throw new Error("No legal arrangement for this console intent.");
      layout = geometryLayout(baseLayout, candidate.geometry);
      data = candidate.data;
    } else if (decision.action === "compose") {
      design = decision.design;
      const geometry = executeDesign(problem, decision.design);
      routingIssues = geometry.routingIssues;
      layout = geometryLayout(baseLayout, geometry);
      data = { ...problem.stored, method: "ai", constraints: [] };
      for (const edge of problem.projection.edges) reroutedEdgeIds.add(edge.id);
    } else if (decision.action === "edit") {
      if (design) validateDesign(problem, design);
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
        if (change.type === "set-routing") {
          if (touched.has("routing")) throw new Error("Conflicting routing replacements.");
          touched.add("routing");
          design ??= {
            purpose: "Local layout",
            readingPath: problem.projection.items.slice(0, 1).map((n) => n.id),
            regions: [],
            scopes: [],
            connections: [],
          };
          design.routing = change.routing;
          validateDesign(problem, design);
          for (const edge of problem.projection.edges) requested.add(edge.id);
          continue;
        }
        if (change.type === "reroute-together") {
          for (const id of change.edgeIds) {
            if (!problem.projection.edges.some((e) => e.id === id)) throw new Error(`Unknown edge: ${id}.`);
            requested.add(id);
          }
          continue;
        }
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
        const routed = routeDesignedEdges(
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
            ...(design
              ? {
                  intent: design.routing ?? emptyRouting(),
                  outerEdges: undefined,
                  edgePriority: new Map(
                    design.connections.map((e) => [e.edgeId, { main: 0, branch: 1, feedback: 2, support: 3 }[e.role]]),
                  ),
                }
              : {}),
          },
        );
        geometry.routes = Object.fromEntries(routed.routes);
        geometry.width = routed.width;
        geometry.height = routed.height;
        routingIssues = routed.issues;
        for (const id of requested) reroutedEdgeIds.add(id);
        requested.clear();
        for (const issue of routeIssues(problem, geometry))
          if (issue.edgeId && !manual.has(issue.edgeId)) requested.add(issue.edgeId);
      }
      layout = geometryLayout(layout, geometry);
    }
    if (design) validateRequiredAnchors(design, draftGeometry(layout, problem));
    if (design?.routing) {
      const g = draftGeometry(layout, problem);
      routingIssues.push(
        ...verifyRoutingIntent(
          problem.projection,
          new Map(Object.entries(g.boxes)),
          new Map(Object.entries(g.routes)),
          { x: 0, y: 0, width: g.width, height: g.height },
          design.routing,
          data.portMode,
        ),
      );
    }
    return {
      layout,
      data,
      design,
      routingIssues,
      reroutedEdgeIds: [...reroutedEdgeIds],
      issues: inspectDraft(layout, { ...problem, stored: data }),
    };
  } catch (error) {
    return {
      layout,
      data,
      design,
      routingIssues,
      reroutedEdgeIds: [...reroutedEdgeIds],
      issues: inspectDraft(layout, problem),
      error: error instanceof Error ? error.message : "Layout execution failed.",
    };
  }
}
