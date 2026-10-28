import { isRecord } from "../../shared/json";

export type LayoutDirection = "AUTO" | "RIGHT" | "DOWN";

export type LayoutObjective = "readability" | "compact";

export type LayoutConstraint =
  | { type: "direction"; scopeId: string | null; value: LayoutDirection; strength: "soft" }
  | { type: "flow-order"; scopeId: string | null; nodeIds: string[]; strength: "soft" }
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
  operation: "layout-and-route";
  boundaryPolicy: "strict" | "allow-ancestor-resize";
  objective: LayoutObjective;
  constraints: LayoutConstraint[];
}

export interface CompoundLayoutData {
  version: 1;
  method: "automatic" | "ai";
  direction: LayoutDirection;
  objective: LayoutObjective;
  portMode: "distributed" | "midpoints";
  constraints: LayoutConstraint[];
}

export function emptyLayoutData(): CompoundLayoutData {
  return {
    version: 1,
    method: "automatic",
    direction: "AUTO",
    objective: "readability",
    portMode: "midpoints",
    constraints: [],
  };
}

export function parseCompoundLayout(value: unknown): CompoundLayoutData {
  const r = object(value, "Compound layout");
  keys(r, ["version", "method", "direction", "objective", "portMode", "constraints"], "compound layout");
  if (r.version !== undefined && r.version !== 1) throw new Error("Unsupported compound layout version.");
  const constraints = r.constraints ?? [];
  if (!Array.isArray(constraints) || constraints.length > 500) throw new Error("Supply at most 500 constraints.");
  return {
    version: 1,
    method: oneOf(r.method ?? "automatic", ["automatic", "ai"], "method"),
    direction: oneOf(r.direction ?? "AUTO", ["AUTO", "RIGHT", "DOWN"], "direction"),
    objective: oneOf(r.objective ?? "readability", ["readability", "compact"], "objective"),
    portMode: oneOf(r.portMode ?? "midpoints", ["distributed", "midpoints"], "port mode"),
    constraints: constraints.map(parseLayoutConstraint),
  };
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
    case "flow-order": {
      keys(c, ["type", "scopeId", "nodeIds", "strength"], "flow order");
      if (!Array.isArray(c.nodeIds) || c.nodeIds.length < 2)
        throw new Error("Flow order requires at least 2 sibling IDs.");
      const nodeIds = c.nodeIds.map((value) => id(value, "nodeId"));
      if (new Set(nodeIds).size !== nodeIds.length) throw new Error("Flow order contains duplicate IDs.");
      return { type: c.type, scopeId: scopeId(c.scopeId), nodeIds, strength: oneOf(c.strength, ["soft"], "strength") };
    }
    case "direction":
      keys(c, ["type", "scopeId", "value", "strength"], "direction");
      return {
        type: c.type,
        scopeId: scopeId(c.scopeId),
        value: oneOf(c.value, ["AUTO", "RIGHT", "DOWN"], "direction"),
        strength: oneOf(c.strength, ["soft"], "strength"),
      };
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
    operation: oneOf(r.operation, ["layout-and-route"], "layout operation"),
    boundaryPolicy: oneOf(r.boundaryPolicy, ["strict", "allow-ancestor-resize"], "boundary policy"),
    objective: oneOf(r.objective, ["readability", "compact"], "layout objective"),
    constraints: r.constraints.map(parseLayoutConstraint),
  };
}

export function defaultLayoutIntent(groupId: string | null = null): LayoutIntent {
  return {
    scope: { groupId, includeDescendants: true },
    operation: "layout-and-route",
    boundaryPolicy: "allow-ancestor-resize",
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
