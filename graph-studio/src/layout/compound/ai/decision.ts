import { LayoutRequestError } from "../../shared/ai/request";
import { parseLayoutIntent, type LayoutIntent } from "../layout-plan";
import type { LayoutPoint } from "../../../schema/layoutGeometry";
import { validateLayoutSchema, layoutResultSchema, type LayoutResultDocument } from "../../../schema/layoutResult";

export const COMPOUND_AI_PROTOCOL_VERSION = 1;
export type CompoundChange =
  | { type: "move-node"; id: string; position: LayoutPoint }
  | { type: "move-group"; id: string; position: LayoutPoint }
  | { type: "resize-group"; id: string; size: LayoutPoint }
  | { type: "reroute-edge"; id: string }
  | { type: "replace-route"; id: string; points: LayoutPoint[]; label: LayoutPoint };
export type CompoundAiDecision =
  | { protocolVersion: 1; action: "evaluate"; hypothesis: string; layout: LayoutResultDocument }
  | { protocolVersion: 1; action: "finish"; candidateId: string; summary: string }
  | { protocolVersion: 1; action: "propose"; hypothesis: string; intent: LayoutIntent }
  | {
      protocolVersion: 1;
      action: "revise";
      hypothesis: string;
      baseCandidateId: string;
      baseRevision: number;
      changes: CompoundChange[];
    };

const text = { type: "string", minLength: 1 };
const scope = { anyOf: [text, { type: "null" }] };
const point = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 };
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const enumeration = (...values: string[]) => ({ type: "string", enum: values });
const constraint = (type: string, fields: Record<string, unknown>) =>
  obj({ type: { const: type }, ...fields, strength: { const: "soft" } });
const change = (type: string, fields: Record<string, unknown> = {}) =>
  obj({ type: { const: type }, id: text, ...fields });
export function compoundDecisionSchema() {
  return {
    oneOf: [
      obj({
        protocolVersion: { const: 1 },
        action: { const: "evaluate" },
        hypothesis: text,
        layout: layoutResultSchema("compound"),
      }),
      obj({ protocolVersion: { const: 1 }, action: { const: "finish" }, candidateId: text, summary: text }),
      obj({
        protocolVersion: { const: 1 },
        action: { const: "propose" },
        hypothesis: text,
        intent: obj({
          scope: obj({ groupId: scope, includeDescendants: { type: "boolean" } }),
          operation: { const: "layout-and-route" },
          boundaryPolicy: enumeration("strict", "allow-ancestor-resize"),
          objective: enumeration("readability", "compact"),
          constraints: {
            type: "array",
            maxItems: 100,
            items: {
              oneOf: [
                constraint("direction", { scopeId: scope, value: enumeration("AUTO", "RIGHT", "DOWN") }),
                constraint("flow-order", {
                  scopeId: scope,
                  nodeIds: { type: "array", items: text, minItems: 2, uniqueItems: true },
                }),
                constraint("prefer-outer-route", { edgeId: text }),
                constraint("port-side", {
                  edgeId: text,
                  end: enumeration("source", "target"),
                  side: enumeration("east", "south", "west", "north"),
                }),
              ],
            },
          },
        }),
      }),
      obj({
        protocolVersion: { const: 1 },
        action: { const: "revise" },
        hypothesis: text,
        baseCandidateId: text,
        baseRevision: { type: "integer", minimum: 0 },
        changes: {
          type: "array",
          minItems: 1,
          maxItems: 100,
          items: {
            oneOf: [
              change("move-node", { position: point }),
              change("move-group", { position: point }),
              change("resize-group", { size: { ...point, items: { type: "number", exclusiveMinimum: 0 } } }),
              change("reroute-edge"),
              change("replace-route", { points: { type: "array", items: point, minItems: 2 }, label: point }),
            ],
          },
        },
      }),
    ],
  };
}

export function parseCompoundDecision(
  value: Record<string, unknown>,
  candidates: ReadonlySet<string>,
  drafts: ReadonlyMap<string, number>,
  requireEvaluation: boolean,
): CompoundAiDecision {
  const branch = compoundDecisionSchema().oneOf.find((schema) => {
    const action = schema.properties.action as { const: string };
    return action.const === value.action;
  });
  if (!branch) throw new LayoutRequestError("schema", "Expected propose, revise, evaluate or finish.", "/action");
  validateLayoutSchema(value, branch, "/");
  if (value.action === "evaluate") return value as unknown as Extract<CompoundAiDecision, { action: "evaluate" }>;
  if (value.action === "finish") {
    if (requireEvaluation) throw new LayoutRequestError("semantic", "Evaluate a proposal before finishing.");
    if (!candidates.has(value.candidateId as string))
      throw new LayoutRequestError("semantic", "Select a successfully evaluated candidate.");
    return value as unknown as Extract<CompoundAiDecision, { action: "finish" }>;
  }
  if (value.action === "propose") {
    try {
      return {
        protocolVersion: 1,
        action: "propose",
        hypothesis: value.hypothesis as string,
        intent: parseLayoutIntent(value.intent),
      };
    } catch (error) {
      throw new LayoutRequestError(
        "schema",
        error instanceof Error ? error.message : "Invalid layout intent.",
        "/intent",
      );
    }
  }
  if (drafts.get(value.baseCandidateId as string) !== value.baseRevision)
    throw new LayoutRequestError("semantic", "Select an existing draft and its exact revision.", "/baseRevision");
  return value as unknown as Extract<CompoundAiDecision, { action: "revise" }>;
}
