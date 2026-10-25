import type { CompoundBox } from "../../../graph/compound/geometry";
import type { CompoundProjection } from "../../../graph/compound/projection";

export type Side = "east" | "south" | "west" | "north";
export type Strength = "required" | "preferred";
export interface RoutingIntent {
  channels: {
    id: string;
    scopeId: string | null;
    location: { type: "between"; regions: [string, string] } | { type: "perimeter"; side: Side };
    edgeIds: string[];
    strength: Strength;
  }[];
  gateways: {
    id: string;
    regionId: string;
    side: Side;
    edgeIds: string[];
    order: "opposite-end";
    strength: Strength;
  }[];
  ports: {
    nodeId: string;
    side: Side;
    ends: { edgeId: string; end: "source" | "target" }[];
    order: "opposite-end";
    strength: Strength;
  }[];
}
export type Anchor = { nodeId: string; kind: "center" } | { gatewayId: string; kind: "gateway-center" };
export interface AnchorAlignment {
  axis: "x" | "y";
  anchors: Anchor[];
  strength: Strength;
}
export interface RoutingIssue {
  id: string;
  kind:
    | "port-congestion"
    | "gateway-order-conflict"
    | "channel-capacity"
    | "avoidable-detour"
    | "ambiguous-parallel-run"
    | "main-path-backtrack"
    | "intent-deviation";
  scopeId: string | null;
  nodeIds: string[];
  edgeIds: string[];
  evidence: Record<string, unknown>;
  repairLevel: "routing" | "placement" | "composition";
  suggestedActions: string[];
}
export const sides: Side[] = ["east", "south", "west", "north"];
export const emptyRouting = (): RoutingIntent => ({ channels: [], gateways: [], ports: [] });
export const center = (b: CompoundBox) => ({ x: b.x + b.width / 2, y: b.y + b.height / 2 });
export function ancestry(projection: CompoundProjection, id: string) {
  const result: string[] = [];
  let parent = projection.items.find((n) => n.id === id)?.parentId;
  while (parent != null && !result.includes(parent)) {
    result.push(parent);
    parent = projection.items.find((n) => n.id === parent)?.parentId;
  }
  return result;
}
export function validateRouting(projection: CompoundProjection, intent: RoutingIntent) {
  const nodes = new Map(projection.items.map((n) => [n.id, n]));
  const edges = new Map(projection.edges.map((e) => [e.id, e]));
  const scope = (id: string | null) =>
    id === null || id === projection.focusGroupId || (nodes.get(id)?.kind === "group" && !nodes.get(id)?.collapsed);
  const unique = (ids: string[], what: string) => {
    if (new Set(ids).size !== ids.length) throw new Error(`Duplicate ${what}.`);
  };
  unique(
    intent.channels.map((c) => c.id),
    "channel ID",
  );
  unique(
    intent.gateways.map((g) => g.id),
    "gateway ID",
  );
  unique([...intent.channels.map((c) => c.id), ...intent.gateways.map((g) => g.id)], "routing intent ID");
  if ([...intent.channels, ...intent.gateways].some((i) => i.id.startsWith("auto:")))
    throw new Error("The auto: routing ID prefix is reserved for inferred interfaces.");
  const assigned = new Set<string>();
  for (const port of intent.ports)
    for (const end of port.ends) {
      const e = edges.get(end.edgeId),
        key = `${end.edgeId}:${end.end}`;
      if (!e || e[end.end] !== port.nodeId) throw new Error(`Port does not match edge endpoint: ${key}.`);
      if (assigned.has(key)) throw new Error(`Conflicting port assignments: ${key}.`);
      assigned.add(key);
    }
  assigned.clear();
  for (const gate of intent.gateways) {
    if (!scope(gate.regionId) || !nodes.has(gate.regionId))
      throw new Error(`Unknown expanded gateway region: ${gate.regionId}.`);
    for (const id of gate.edgeIds) {
      const e = edges.get(id),
        key = `${gate.regionId}:${id}`;
      if (
        !e ||
        ancestry(projection, e.source).includes(gate.regionId) ===
          ancestry(projection, e.target).includes(gate.regionId)
      )
        throw new Error(`Gateway edge must cross region boundary: ${id}, ${gate.regionId}.`);
      if (assigned.has(key)) throw new Error(`Conflicting gateway assignments: ${key}.`);
      assigned.add(key);
    }
  }
  for (const c of intent.channels) {
    if (!scope(c.scopeId)) throw new Error(`Unknown channel scope: ${c.scopeId}.`);
    if (c.location.type === "between") {
      const [a, b] = c.location.regions;
      if (
        a === b ||
        [a, b].some(
          (id) =>
            !nodes.has(id) || nodes.get(id)!.parentId !== (c.scopeId === projection.focusGroupId ? null : c.scopeId),
        )
      )
        throw new Error(`Channel ${c.id} requires two distinct direct siblings.`);
    }
    unique(c.edgeIds, "channel edge");
    for (const id of c.edgeIds) {
      const e = edges.get(id);
      if (!e) throw new Error(`Unknown channel edge: ${id}.`);
      if (
        c.scopeId !== null &&
        c.scopeId !== projection.focusGroupId &&
        ![e.source, e.target].every((n) => ancestry(projection, n).includes(c.scopeId!))
      )
        throw new Error(`Channel ${c.id} must contain both edge endpoints in its scope.`);
    }
  }
}
