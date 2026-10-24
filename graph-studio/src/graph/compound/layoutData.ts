import { isRecord } from "../../shared/json";
import type { GraphDocument } from "../types";
import type { CompoundBox, CompoundRoute } from "./geometry";

export type LayoutDirection = "AUTO" | "RIGHT" | "DOWN";

export type LayoutObjective = "readability" | "stability" | "compact";

export type LayoutConstraint =
  | { type: "direction"; scopeId: string | null; value: LayoutDirection; strength: "soft" }
  | { type: "pin"; nodeId: string; space: "canvas" | "parent"; strength: "hard" }
  | { type: "unpin"; nodeId: string }
  | { type: "prefer-outer-route"; edgeId: string; strength: "soft" }
  | {
      type: "port-side";
      edgeId: string;
      end: "source" | "target";
      side: "east" | "south" | "west" | "north";
      strength: "soft";
    };

export interface LayoutIntent {
  scope: { groupId: string | null; includeDescendants: boolean };
  operation: "layout-and-route" | "route-only";
  boundaryPolicy: "strict" | "allow-ancestor-resize";
  objective: LayoutObjective;
  constraints: LayoutConstraint[];
}

export interface LayoutPin {
  nodeId: string;
  parentId: string | null;
  space: "canvas" | "parent";
  x: number;
  y: number;
  projectionKey?: string;
}

export interface LayoutSnapshot {
  boxes: Record<string, CompoundBox>;
  routes: Record<string, CompoundRoute>;
  width: number;
  height: number;
}

export interface CompoundLayoutData {
  version: 1;
  constraints: Exclude<LayoutConstraint, { type: "pin" | "unpin" }>[];
  pins: LayoutPin[];
  accepted?: { fingerprint: string; engineVersion: string; snapshot: LayoutSnapshot };
}

export function emptyLayoutData(): CompoundLayoutData {
  return { version: 1, constraints: [], pins: [] };
}

function object(value: unknown, name: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${name} must be an object.`);
  return value;
}

function keys(value: Record<string, unknown>, allowed: string[], name: string) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`Unknown ${name} field: ${key}.`);
}

function id(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim() || value.length > 1024)
    throw new Error(`${name} must be a nonempty ID.`);
  return value;
}

function scopeId(value: unknown): string | null {
  return value === null ? null : id(value, "scopeId");
}

function oneOf<T extends string>(value: unknown, allowed: readonly T[], name: string): T {
  if (!allowed.includes(value as T)) throw new Error(`Invalid ${name}: expected ${allowed.join(", ")}.`);
  return value as T;
}

export function parseLayoutConstraint(value: unknown): LayoutConstraint {
  const c = object(value, "Constraint");
  switch (c.type) {
    case "direction":
      keys(c, ["type", "scopeId", "value", "strength"], "direction");
      return {
        type: c.type,
        scopeId: scopeId(c.scopeId),
        value: oneOf(c.value, ["AUTO", "RIGHT", "DOWN"], "direction"),
        strength: oneOf(c.strength, ["soft"], "strength"),
      };
    case "pin":
      keys(c, ["type", "nodeId", "space", "strength"], "pin");
      return {
        type: c.type,
        nodeId: id(c.nodeId, "nodeId"),
        space: oneOf(c.space, ["canvas", "parent"], "pin space"),
        strength: oneOf(c.strength, ["hard"], "strength"),
      };
    case "unpin":
      keys(c, ["type", "nodeId"], "unpin");
      return { type: c.type, nodeId: id(c.nodeId, "nodeId") };
    case "prefer-outer-route":
      keys(c, ["type", "edgeId", "strength"], "outer route");
      return { type: c.type, edgeId: id(c.edgeId, "edgeId"), strength: oneOf(c.strength, ["soft"], "strength") };
    case "port-side":
      keys(c, ["type", "edgeId", "end", "side", "strength"], "port side");
      return {
        type: c.type,
        edgeId: id(c.edgeId, "edgeId"),
        end: oneOf(c.end, ["source", "target"], "port end"),
        side: oneOf(c.side, ["east", "south", "west", "north"], "port side"),
        strength: oneOf(c.strength, ["soft"], "strength"),
      };
    default:
      throw new Error(`Unsupported layout constraint: ${String(c.type)}.`);
  }
}

export function parseLayoutIntent(value: unknown): LayoutIntent {
  const r = object(value, "Layout intent");
  keys(r, ["scope", "operation", "boundaryPolicy", "objective", "constraints"], "layout intent");
  const scope = object(r.scope, "Layout scope");
  keys(scope, ["groupId", "includeDescendants"], "layout scope");
  if (typeof scope.includeDescendants !== "boolean") throw new Error("includeDescendants must be boolean.");
  if (!Array.isArray(r.constraints) || r.constraints.length > 100)
    throw new Error("Supply at most 100 layout constraints.");
  return {
    scope: { groupId: scopeId(scope.groupId), includeDescendants: scope.includeDescendants },
    operation: oneOf(r.operation, ["layout-and-route", "route-only"], "layout operation"),
    boundaryPolicy: oneOf(r.boundaryPolicy, ["strict", "allow-ancestor-resize"], "boundary policy"),
    objective: oneOf(r.objective, ["readability", "stability", "compact"], "layout objective"),
    constraints: r.constraints.map(parseLayoutConstraint),
  };
}

export function defaultLayoutIntent(groupId: string | null = null): LayoutIntent {
  return {
    scope: { groupId, includeDescendants: true },
    operation: "layout-and-route",
    boundaryPolicy: "strict",
    objective: "readability",
    constraints: [],
  };
}

export function layoutFingerprint(value: unknown): string {
  const canonical = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canonical)
      : isRecord(v)
        ? Object.fromEntries(
            Object.keys(v)
              .sort()
              .map((k) => [k, canonical(v[k])]),
          )
        : v;
  const text = JSON.stringify(canonical(value));
  let a = 2166136261,
    b = 5381;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b, 33) ^ text.charCodeAt(i);
  }
  return `${text.length}:${a >>> 0}:${b >>> 0}`;
}

export function layoutMetadataValue(doc: Pick<GraphDocument, "metadata">): unknown {
  return isRecord(doc.metadata?.layout) ? doc.metadata.layout.compound : undefined;
}

export function readLayoutData(doc: Pick<GraphDocument, "metadata">): { data: CompoundLayoutData; warning?: string } {
  const value = layoutMetadataValue(doc);
  if (value === undefined) return { data: emptyLayoutData() };
  try {
    const r = object(value, "Saved compound layout");
    if (r.version !== 1) throw new Error("Unsupported saved compound layout version; metadata has been preserved.");
    if (!Array.isArray(r.constraints) || r.constraints.length > 500 || !Array.isArray(r.pins) || r.pins.length > 1000)
      throw new Error("Invalid saved layout constraints.");
    const constraints = r.constraints.map(parseLayoutConstraint);
    if (constraints.some((c) => c.type === "pin" || c.type === "unpin"))
      throw new Error("Saved pins must include captured coordinates.");
    const pins = r.pins.map((value) => {
      const p = object(value, "Saved pin");
      if (![p.x, p.y].every((v) => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e7))
        throw new Error("Invalid saved pin coordinates.");
      if (p.projectionKey !== undefined && (typeof p.projectionKey !== "string" || p.projectionKey.length > 200000))
        throw new Error("Invalid pin projection.");
      return {
        nodeId: id(p.nodeId, "nodeId"),
        parentId: scopeId(p.parentId),
        space: oneOf(p.space, ["canvas", "parent"], "pin space"),
        x: p.x as number,
        y: p.y as number,
        ...(p.projectionKey === undefined ? {} : { projectionKey: p.projectionKey as string }),
      };
    });
    const data: CompoundLayoutData = {
      version: 1,
      constraints: constraints as CompoundLayoutData["constraints"],
      pins,
    };
    if (r.accepted !== undefined) {
      const a = object(r.accepted, "Accepted layout");
      data.accepted = {
        fingerprint: id(a.fingerprint, "fingerprint"),
        engineVersion: id(a.engineVersion, "engineVersion"),
        snapshot: parseLayoutSnapshot(a.snapshot),
      };
    }
    return { data };
  } catch (error) {
    return {
      data: emptyLayoutData(),
      warning: error instanceof Error ? error.message : "Invalid saved compound layout.",
    };
  }
}

export function parseLayoutSnapshot(value: unknown): LayoutSnapshot {
  const r = object(value, "Layout snapshot");
  const number = (value: unknown) => {
    if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > 1e7)
      throw new Error("Invalid layout coordinate.");
    return value;
  };
  const boxes = object(r.boxes, "Layout boxes"),
    routes = object(r.routes, "Layout routes");
  if (Object.keys(boxes).length > 10000 || Object.keys(routes).length > 20000)
    throw new Error("Saved layout is too large.");
  return {
    width: number(r.width),
    height: number(r.height),
    boxes: Object.fromEntries(
      Object.entries(boxes).map(([key, value]) => {
        const b = object(value, "Box");
        return [key, { x: number(b.x), y: number(b.y), width: number(b.width), height: number(b.height) }];
      }),
    ),
    routes: Object.fromEntries(
      Object.entries(routes).map(([key, value]) => {
        const route = object(value, "Route");
        const point = (value: unknown) => {
          const p = object(value, "Point");
          return { x: number(p.x), y: number(p.y) };
        };
        if (!Array.isArray(route.points) || route.points.length < 2 || route.points.length > 2048)
          throw new Error("Invalid route point count.");
        return [key, { points: route.points.map(point), labelPosition: point(route.labelPosition) }];
      }),
    ),
  };
}

export function writeLayoutData(doc: GraphDocument, data: CompoundLayoutData) {
  doc.metadata = {
    ...doc.metadata,
    layout: { ...(isRecord(doc.metadata?.layout) ? doc.metadata.layout : {}), compound: data },
  };
}

export function remapImportedLayoutData(
  doc: GraphDocument,
  nodes: Map<string, string>,
  edges: Map<string, string | null>,
) {
  const read = readLayoutData(doc);
  if (layoutMetadataValue(doc) === undefined || read.warning) return;
  const remap = (key: string | null) => (key === null ? null : (nodes.get(key) ?? key));
  const data = read.data;
  data.constraints = data.constraints.flatMap<CompoundLayoutData["constraints"][number]>((c) => {
    if (c.type === "direction") return [{ ...c, scopeId: remap(c.scopeId) }];
    const edgeId = edges.has(c.edgeId) ? edges.get(c.edgeId) : c.edgeId;
    return edgeId ? [{ ...c, edgeId }] : [];
  });
  data.pins = data.pins.map((p) => {
    let projectionKey = p.projectionKey;
    if (projectionKey) {
      try {
        const [focus, collapsed, filter] = JSON.parse(projectionKey);
        projectionKey = JSON.stringify([remap(focus), collapsed.map(remap).sort(), filter]);
      } catch {
        /* Opaque future keys stay inactive. */
      }
    }
    return { ...p, nodeId: remap(p.nodeId)!, parentId: remap(p.parentId), ...(projectionKey ? { projectionKey } : {}) };
  });
  delete data.accepted;
  writeLayoutData(doc, data);
}

/** Repair durable references in the same transaction as graph edits. Unknown metadata remains untouched. */
export function repairLayoutData(doc: GraphDocument, previous: GraphDocument, rename?: { from: string; to: string }) {
  const read = readLayoutData(doc);
  if (layoutMetadataValue(doc) === undefined || read.warning) return;
  const remap = (key: string | null) => (key === rename?.from ? rename.to : key);
  const nodes = new Set(Object.keys(doc.nodes)),
    edges = new Set(doc.edges.map((e) => e.id));
  const parents = new Map((doc.hierarchy_edges ?? []).map((e) => [e.target, e.source]));
  const oldParents = new Map((previous.hierarchy_edges ?? []).map((e) => [remap(e.target), remap(e.source)]));
  const data = read.data;
  data.constraints = data.constraints.flatMap<CompoundLayoutData["constraints"][number]>((c) => {
    if (c.type === "direction") {
      const scopeId = remap(c.scopeId);
      return scopeId === null || nodes.has(scopeId) ? [{ ...c, scopeId }] : [];
    }
    return edges.has(c.edgeId) ? [c] : [];
  });
  data.pins = data.pins.flatMap((p) => {
    const nodeId = remap(p.nodeId)!;
    if (
      !nodes.has(nodeId) ||
      remap(p.parentId) !== (parents.get(nodeId) ?? null) ||
      (Object.prototype.hasOwnProperty.call(previous.nodes, rename?.to === nodeId ? rename.from : nodeId) &&
        (oldParents.get(nodeId) ?? null) !== (parents.get(nodeId) ?? null))
    )
      return [];
    let projectionKey = p.projectionKey;
    if (rename && projectionKey) {
      try {
        const [focus, collapsed, filter] = JSON.parse(projectionKey);
        projectionKey = JSON.stringify([remap(focus), collapsed.map(remap).sort(), filter]);
      } catch {
        /* Preserve an opaque future projection key without applying it. */
      }
    }
    return [{ ...p, nodeId, parentId: remap(p.parentId), ...(projectionKey ? { projectionKey } : {}) }];
  });
  delete data.accepted;
  writeLayoutData(doc, data);
}
