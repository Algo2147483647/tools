import type { CompoundBox, CompoundRoute } from "../../../graph/compound/geometry";
import type { CompoundProjection } from "../../../graph/compound/projection";
import {
  ancestry,
  center,
  emptyRouting,
  sides,
  validateRouting,
  type RoutingIntent,
  type RoutingIssue,
  type Side,
} from "./intent";
import { LANE_GAP, type Point, type Port } from "./types";

export interface Passage {
  id: string;
  entry: Point;
  exit: Point;
  direction: number;
  required: boolean;
}
export interface RoutingPlan {
  endpoints: Map<string, { source: Port; target: Port }>;
  passages: Map<string, Passage[]>;
  issues: RoutingIssue[];
}
const vector = (side: number) => ({ x: side === 0 ? 1 : side === 2 ? -1 : 0, y: side === 1 ? 1 : side === 3 ? -1 : 0 });
export function boundaryPoint(box: CompoundBox, side: Side, offset = 0): Point {
  const c = center(box);
  return side === "east"
    ? { x: box.x + box.width, y: c.y + offset }
    : side === "west"
      ? { x: box.x, y: c.y + offset }
      : side === "south"
        ? { x: c.x + offset, y: box.y + box.height }
        : { x: c.x + offset, y: box.y };
}
export const channelWidth = (count: number) => 24 + Math.max(0, count - 1) * LANE_GAP;
export function facing(a: Point, b: Point): Side {
  return Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? (b.x >= a.x ? "east" : "west") : b.y >= a.y ? "south" : "north";
}
export function compileRoutingPlan(
  projection: CompoundProjection,
  boxes: Map<string, CompoundBox>,
  bounds: CompoundBox,
  intent: RoutingIntent = emptyRouting(),
  mode: "distributed" | "midpoints" = "midpoints",
  fixed: Map<string, CompoundRoute> = new Map(),
  reversePorts: Set<string> = new Set(),
): RoutingPlan {
  validateRouting(projection, intent);
  const plan: RoutingPlan = { endpoints: new Map(), passages: new Map(), issues: [] };
  const edges = new Map(projection.edges.map((e) => [e.id, e]));
  const gateAssignments = new Map<string, { id: string; side: Side; required: boolean }>();
  for (const g of intent.gateways)
    for (const id of g.edgeIds)
      gateAssignments.set(`${g.regionId}:${id}`, { id: g.id, side: g.side, required: g.strength === "required" });
  type GateUse = {
    edgeId: string;
    region: string;
    entering: boolean;
    side: Side;
    id: string;
    required: boolean;
    opposite: Point;
    rank: number;
  };
  const uses: GateUse[] = [];
  for (const e of projection.edges) {
    const source = ancestry(projection, e.source).filter((id) => boxes.has(id));
    const target = ancestry(projection, e.target).filter((id) => boxes.has(id));
    const chain = [
      ...source.filter((id) => !target.includes(id) && id !== e.target).map((region) => ({ region, entering: false })),
      ...target
        .filter((id) => !source.includes(id) && id !== e.source)
        .reverse()
        .map((region) => ({ region, entering: true })),
    ];
    chain.forEach(({ region, entering }, rank) => {
      const opposite = center(boxes.get(entering ? e.source : e.target)!);
      const explicit = gateAssignments.get(`${region}:${e.id}`);
      let side = explicit?.side ?? facing(center(boxes.get(region)!), opposite);
      // Automatic gateways avoid the group title band.
      if (!explicit && side === "north") side = opposite.x < center(boxes.get(region)!).x ? "west" : "east";
      uses.push({
        edgeId: e.id,
        region,
        entering,
        opposite,
        side,
        rank,
        id: explicit?.id ?? `auto:${region}:${side}`,
        required: explicit?.required ?? false,
      });
    });
  }
  const buckets = new Map<string, GateUse[]>();
  for (const use of uses) {
    const k = `${use.region}:${use.side}`;
    buckets.set(k, [...(buckets.get(k) ?? []), use]);
  }
  const ranked = new Map<string, { rank: number; passage: Passage }[]>();
  for (const bucket of buckets.values()) {
    const first = bucket[0],
      b = boxes.get(first.region)!,
      vertical = first.side === "east" || first.side === "west";
    bucket.sort(
      (a, b) =>
        (vertical ? a.opposite.y - b.opposite.y : a.opposite.x - b.opposite.x) || a.edgeId.localeCompare(b.edgeId),
    );
    const start = vertical ? b.y + 48 : b.x + 16;
    const end = vertical ? b.y + b.height - 16 : b.x + b.width - 16;
    const required = (bucket.length - 1) * LANE_GAP;
    if (end - start < required) {
      const issue: RoutingIssue = {
        id: `gateway-capacity:${first.region}:${first.side}`,
        kind: "channel-capacity",
        scopeId: first.region,
        nodeIds: [first.region],
        edgeIds: bucket.map((u) => u.edgeId),
        evidence: { requiredWidth: required, availableWidth: end - start },
        repairLevel: "placement",
        suggestedActions: ["enlarge-region", "change-gateway-side"],
      };
      if (bucket.some((u) => u.required)) throw new Error(JSON.stringify(issue));
      plan.issues.push(issue);
    }
    const pitch = Math.min(LANE_GAP, Math.max(0, end - start) / Math.max(1, bucket.length - 1));
    const coords = bucket.map((u) => Math.max(start, Math.min(end, vertical ? u.opposite.y : u.opposite.x)));
    for (let i = 1; i < coords.length; i++) coords[i] = Math.max(coords[i], coords[i - 1] + pitch);
    if (coords[coords.length - 1] > end) {
      coords[coords.length - 1] = end;
      for (let i = coords.length - 2; i >= 0; i--) coords[i] = Math.min(coords[i], coords[i + 1] - pitch);
    }
    bucket.forEach((use, i) => {
      const coord = coords[i];
      const p = boundaryPoint(b, use.side, coord - (vertical ? center(b).y : center(b).x));
      const d = sides.indexOf(use.side),
        v = vector(d),
        distance = 10;
      const inward = use.side === "north" ? 50 : distance;
      const inside = { x: p.x - v.x * inward, y: p.y - v.y * inward },
        outside = { x: p.x + v.x * distance, y: p.y + v.y * distance };
      const passage: Passage = {
        id: use.id,
        entry: use.entering ? outside : inside,
        exit: use.entering ? inside : outside,
        direction: use.entering ? (d + 2) % 4 : d,
        required: use.required,
      };
      ranked.set(use.edgeId, [...(ranked.get(use.edgeId) ?? []), { rank: use.rank, passage }]);
    });
  }
  for (const [id, values] of ranked)
    plan.passages.set(
      id,
      values.sort((a, b) => a.rank - b.rank).map((v) => v.passage),
    );
  for (const channel of intent.channels) {
    const region =
      channel.scopeId === null || channel.scopeId === projection.focusGroupId ? bounds : boxes.get(channel.scopeId)!;
    let vertical: boolean, lo: number, hi: number, from: number, to: number;
    if (channel.location.type === "between") {
      const [a, b] = channel.location.regions.map((id) => boxes.get(id)!);
      vertical = a.x + a.width <= b.x || b.x + b.width <= a.x;
      const ordered = [a, b].sort((a, b) => (vertical ? a.x - b.x : a.y - b.y));
      lo = vertical ? ordered[0].x + ordered[0].width : ordered[0].y + ordered[0].height;
      hi = vertical ? ordered[1].x : ordered[1].y;
      from = vertical ? Math.max(a.y, b.y) : Math.max(a.x, b.x);
      to = vertical ? Math.min(a.y + a.height, b.y + b.height) : Math.min(a.x + a.width, b.x + b.width);
    } else {
      const side = channel.location.side;
      vertical = side === "east" || side === "west";
      const n = channelWidth(channel.edgeIds.length);
      const inset = channel.scopeId == null ? 0 : side === "north" ? 42 : 0;
      lo = vertical
        ? side === "west"
          ? region.x + inset
          : region.x + region.width - n
        : side === "north"
          ? region.y + inset
          : region.y + region.height - n;
      hi = lo + n;
      from = vertical ? region.y + 48 : region.x + 16;
      to = vertical ? region.y + region.height - 16 : region.x + region.width - 16;
    }
    const needed = channelWidth(channel.edgeIds.length);
    if (hi - lo < needed || to <= from) {
      const issue: RoutingIssue = {
        id: `channel-capacity:${channel.id}`,
        kind: "channel-capacity",
        scopeId: channel.scopeId,
        nodeIds: channel.location.type === "between" ? channel.location.regions : [],
        edgeIds: channel.edgeIds,
        evidence: { requiredWidth: needed, availableWidth: hi - lo, sharedSpan: to - from },
        repairLevel: "placement",
        suggestedActions: ["increase-gap", "change-channel", "recompose-regions"],
      };
      if (channel.strength === "required") throw new Error(JSON.stringify(issue));
      plan.issues.push(issue);
      continue;
    }
    const ids = [...channel.edgeIds].sort((a, b) => {
      const ea = edges.get(a)!,
        eb = edges.get(b)!;
      const ca = center(boxes.get(ea.target)!),
        cb = center(boxes.get(eb.target)!);
      return (vertical ? ca.x - cb.x : ca.y - cb.y) || a.localeCompare(b);
    });
    ids.forEach((id, i) => {
      const e = edges.get(id)!,
        a = center(boxes.get(e.source)!),
        b = center(boxes.get(e.target)!);
      const lane = (lo + hi) / 2 + (i - (ids.length - 1) / 2) * LANE_GAP;
      const clamp = (n: number) => Math.max(from, Math.min(to, n));
      let start = clamp(vertical ? a.y : a.x),
        end = clamp(vertical ? b.y : b.x);
      if (Math.abs(end - start) < 4) {
        start = Math.max(from, start - 2);
        end = Math.min(to, end + 2);
      }
      const passage: Passage = {
        id: channel.id,
        entry: vertical ? { x: lane, y: start } : { x: start, y: lane },
        exit: vertical ? { x: lane, y: end } : { x: end, y: lane },
        direction: vertical ? (end >= start ? 1 : 3) : end >= start ? 0 : 2,
        required: channel.strength === "required",
      };
      const values = plan.passages.get(id) ?? [];
      const sourceGates = uses.filter((u) => u.edgeId === id && !u.entering).length;
      const position =
        channel.scopeId == null
          ? sourceGates
          : uses.filter(
              (u) => u.edgeId === id && !u.entering && ancestry(projection, u.region).includes(channel.scopeId!),
            ).length;
      values.splice(position, 0, passage);
      plan.passages.set(id, values);
    });
  }
  const explicitPorts = new Map<string, { side: Side; required: boolean }>();
  for (const p of intent.ports)
    for (const end of p.ends)
      explicitPorts.set(`${end.edgeId}:${end.end}`, { side: p.side, required: p.strength === "required" });
  type End = {
    edgeId: string;
    end: "source" | "target";
    nodeId: string;
    opposite: Point;
    side: Side;
    required: boolean;
  };
  const ends: End[] = [];
  for (const e of projection.edges)
    for (const end of ["source", "target"] as const) {
      const values = plan.passages.get(e.id) ?? [],
        explicit = explicitPorts.get(`${e.id}:${end}`);
      const opposite =
        end === "source"
          ? (values[0]?.entry ?? center(boxes.get(e.target)!))
          : (values.at(-1)?.exit ?? center(boxes.get(e.source)!));
      ends.push({
        edgeId: e.id,
        end,
        nodeId: e[end],
        opposite,
        side: explicit?.side ?? facing(center(boxes.get(e[end])!), opposite),
        required: explicit?.required ?? false,
      });
    }
  const portBuckets = new Map<string, End[]>();
  for (const end of ends) {
    const key = `${end.nodeId}:${end.side}`;
    portBuckets.set(key, [...(portBuckets.get(key) ?? []), end]);
  }
  for (const bucket of portBuckets.values()) {
    const first = bucket[0],
      b = boxes.get(first.nodeId)!,
      vertical = first.side === "east" || first.side === "west";
    const available = (vertical ? b.height : b.width) - 24;
    bucket.sort(
      (a, b) =>
        (vertical ? a.opposite.y - b.opposite.y : a.opposite.x - b.opposite.x) ||
        a.edgeId.localeCompare(b.edgeId) ||
        a.end.localeCompare(b.end),
    );
    const slots = bucket
      .map((e, i) => ({ e, i }))
      .filter(
        ({ e }) => reversePorts.has(e.edgeId) && !explicitPorts.has(`${e.edgeId}:${e.end}`) && !fixed.has(e.edgeId),
      );
    const reversed = slots.map((s) => s.e).reverse();
    slots.forEach((s, i) => (bucket[s.i] = reversed[i]));
    bucket.forEach((end, i) => {
      const route = fixed.get(end.edgeId),
        old = end.end === "source" ? route?.points[0] : route?.points.at(-1);
      const offset =
        mode === "midpoints"
          ? 0
          : (i - (bucket.length - 1) / 2) * Math.min(LANE_GAP, available / Math.max(1, bucket.length - 1));
      const point = old ?? boundaryPoint(b, end.side, offset),
        d = sides.indexOf(end.side),
        v = vector(d);
      const port: Port = { point, stub: { x: point.x + v.x * 8, y: point.y + v.y * 8 }, direction: d };
      const pair = plan.endpoints.get(end.edgeId) ?? ({} as { source: Port; target: Port });
      pair[end.end] = port;
      plan.endpoints.set(end.edgeId, pair);
    });
  }
  return plan;
}
