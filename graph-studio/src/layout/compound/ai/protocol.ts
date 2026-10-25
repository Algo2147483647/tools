import {
  parseLayoutConstraint,
  type CompoundLayoutData,
  type LayoutConstraint,
  type LayoutDirection,
} from "../../../graph/compound/layoutData";
import { LayoutRequestError, layoutObject } from "../../shared/ai/request";

export const COMPOUND_AI_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["version", "preferences", "constraints"],
  properties: {
    version: { type: "integer", enum: [1] },
    preferences: {
      type: "object",
      additionalProperties: false,
      required: ["direction"],
      properties: { direction: { type: "string", enum: ["AUTO", "RIGHT", "DOWN"] } },
    },
    constraints: {
      type: "array",
      maxItems: 32,
      items: {
        anyOf: [
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "scopeId", "value"],
            properties: {
              type: { type: "string", enum: ["direction"] },
              scopeId: { type: ["string", "null"] },
              value: { type: "string", enum: ["AUTO", "RIGHT", "DOWN"] },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "scopeId", "nodeIds"],
            properties: {
              type: { type: "string", enum: ["flow-order"] },
              scopeId: { type: ["string", "null"] },
              nodeIds: { type: "array", minItems: 2, maxItems: 32, items: { type: "string" } },
            },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "edgeId"],
            properties: { type: { type: "string", enum: ["prefer-outer-route"] }, edgeId: { type: "string" } },
          },
          {
            type: "object",
            additionalProperties: false,
            required: ["type", "edgeId", "end", "side"],
            properties: {
              type: { type: "string", enum: ["port-side"] },
              edgeId: { type: "string" },
              end: { type: "string", enum: ["source", "target"] },
              side: { type: "string", enum: ["east", "south", "west", "north"] },
            },
          },
        ],
      },
    },
  },
};

export interface CompoundAiPlan {
  direction: LayoutDirection;
  constraints: LayoutConstraint[];
}
export interface CompoundAiPolicy {
  direction: LayoutDirection;
  edgeIds: ReadonlySet<string>;
  scopes?: ReadonlyMap<string | null, { nodeIds: string[]; orderable: boolean }>;
  scopeId?: string | null;
}
export function parseCompoundAiPlan(value: unknown, policy: CompoundAiPolicy): CompoundAiPlan {
  const r = layoutObject(value, ["version", "preferences", "constraints"], "");
  if (r.version !== 1) throw new LayoutRequestError("schema", "Expected version 1.", "/version");
  const p = layoutObject(r.preferences, ["direction"], "/preferences");
  if (!["AUTO", "RIGHT", "DOWN"].includes(p.direction as string))
    throw new LayoutRequestError("schema", "Expected AUTO, RIGHT or DOWN.", "/preferences/direction");
  if (policy.direction !== "AUTO" && p.direction !== policy.direction)
    throw new LayoutRequestError(
      "semantic",
      `Preserve the selected direction: ${policy.direction}.`,
      "/preferences/direction",
    );
  if (!Array.isArray(r.constraints) || r.constraints.length > 32)
    throw new LayoutRequestError("schema", "Expected at most 32 constraints.", "/constraints");
  const used = new Set<string>();
  const constraints = r.constraints.map((value, i) => {
    const path = `/constraints/${i}`;
    const c = layoutObject(value, ["type", "edgeId", "end", "side", "scopeId", "value", "nodeIds"], path);
    let parsed: LayoutConstraint;
    try {
      parsed = parseLayoutConstraint({ ...c, strength: "soft" });
    } catch (error) {
      throw new LayoutRequestError("schema", error instanceof Error ? error.message : "Invalid constraint.", path);
    }
    if (parsed.type === "direction" || parsed.type === "flow-order") {
      const scope = policy.scopes?.get(parsed.scopeId);
      if (!scope) throw new LayoutRequestError("semantic", "Use a supplied expanded scope.", `${path}/scopeId`);
      if (parsed.type === "direction" && parsed.scopeId === (policy.scopeId ?? null) && parsed.value !== p.direction)
        throw new LayoutRequestError("semantic", "Root direction must match preferences.direction.", `${path}/value`);
      if (
        parsed.type === "flow-order" &&
        (!scope.orderable ||
          parsed.nodeIds.length !== scope.nodeIds.length ||
          parsed.nodeIds.some((id) => !scope.nodeIds.includes(id)))
      )
        throw new LayoutRequestError(
          "semantic",
          "Flow order must list every movable sibling in the supplied orderable scope exactly once.",
          `${path}/nodeIds`,
        );
    } else if (!policy.edgeIds.has(parsed.edgeId))
      throw new LayoutRequestError("semantic", "Use an edge ID from the supplied scope.", `${path}/edgeId`);
    const key = JSON.stringify([c.type, c.scopeId, c.edgeId, c.end]);
    if (used.has(key))
      throw new LayoutRequestError("semantic", "Duplicate or conflicting preference for this edge.", path);
    used.add(key);
    return parsed;
  });
  return { direction: p.direction as LayoutDirection, constraints };
}

export function applyCompoundAiPlan(
  current: CompoundLayoutData,
  plan: CompoundAiPlan,
  scopeId: string | null,
  replacement?: { edgeIds: ReadonlySet<string>; scopes: ReadonlyMap<string | null, unknown> },
): CompoundLayoutData {
  // A plan replaces only the supplied editable scope. Empty means clear, not append.
  const constraints = current.constraints.filter((c) =>
    replacement
      ? "scopeId" in c
        ? !replacement.scopes.has(c.scopeId)
        : !replacement.edgeIds.has(c.edgeId)
      : scopeId !== null && (!("scopeId" in c) || c.scopeId !== scopeId),
  );
  constraints.push(...plan.constraints);
  return { ...current, method: "ai", direction: plan.direction, constraints };
}
