import { LayoutRequestError } from "../../shared/ai/request";
import type { LayoutPoint } from "../../../schema/layoutGeometry";
import { validateLayoutSchema } from "../../../schema/layoutResult";
import type { CompoundDesign } from "./design";

export const COMPOUND_AI_PROTOCOL_VERSION = 2;
export interface DesignReview {
  candidateId: string;
  revision: number;
  readingFlow: string;
  hierarchy: string;
  relationships: string;
  problems: { ids: string[]; observation: string; change: string; expectedEffect: string }[];
}
export type CompoundChange =
  | { type: "move-node"; id: string; position: LayoutPoint }
  | { type: "move-group"; id: string; position: LayoutPoint }
  | { type: "resize-group"; id: string; size: LayoutPoint }
  | { type: "reroute-edge"; id: string }
  | { type: "replace-route"; id: string; points: LayoutPoint[]; label: LayoutPoint };
export type CompoundAiDecision =
  | { protocolVersion: 2; action: "design"; hypothesis: string; design: CompoundDesign; review: DesignReview | null }
  | { protocolVersion: 2; action: "finish"; candidateId: string; summary: string; review: DesignReview }
  | {
      protocolVersion: 2;
      action: "revise";
      hypothesis: string;
      baseCandidateId: string;
      baseRevision: number;
      changes: CompoundChange[];
      review: DesignReview;
    };

const text = { type: "string", minLength: 1 };
const point = { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 };
const list = (items: unknown, minItems = 0) => ({ type: "array", items, minItems, maxItems: 100 });
const obj = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});
const enumeration = (...values: string[]) => ({ type: "string", enum: values });
const change = (type: string, fields: Record<string, unknown> = {}) =>
  obj({ type: { const: type }, id: text, ...fields });
const reviewSchema = obj({
  candidateId: text,
  revision: { type: "integer", minimum: 0 },
  readingFlow: text,
  hierarchy: text,
  relationships: text,
  problems: list(obj({ ids: list(text, 1), observation: text, change: text, expectedEffect: text })),
});
export function compoundDecisionSchema() {
  const protocolVersion = { const: 2 };
  return {
    oneOf: [
      obj({
        protocolVersion,
        action: { const: "design" },
        hypothesis: text,
        review: { anyOf: [reviewSchema, { type: "null" }] },
        design: obj({
          purpose: text,
          readingPath: list(text, 1),
          regions: list(obj({ id: text, role: enumeration("primary", "branch", "support"), reason: text }), 1),
          scopes: list(
            obj({
              groupId: { anyOf: [text, { type: "null" }] },
              direction: enumeration("RIGHT", "DOWN"),
              rows: list(list({ anyOf: [text, { type: "null" }] }, 1), 1),
              reason: text,
            }),
            1,
          ),
          connections: list(obj({ edgeId: text, role: enumeration("main", "branch", "feedback", "support") })),
        }),
      }),
      obj({
        protocolVersion,
        action: { const: "revise" },
        hypothesis: text,
        review: reviewSchema,
        baseCandidateId: text,
        baseRevision: { type: "integer", minimum: 1 },
        changes: list(
          {
            oneOf: [
              change("move-node", { position: point }),
              change("move-group", { position: point }),
              change("resize-group", { size: { ...point, items: { type: "number", exclusiveMinimum: 0 } } }),
              change("reroute-edge"),
              change("replace-route", { points: { type: "array", items: point, minItems: 2 }, label: point }),
            ],
          },
          1,
        ),
      }),
      obj({ protocolVersion, action: { const: "finish" }, candidateId: text, summary: text, review: reviewSchema }),
    ],
  };
}

export function parseCompoundDecision(
  value: Record<string, unknown>,
  session: { candidateId: string; revision: number; valid: boolean; designed: boolean },
): CompoundAiDecision {
  const branch = compoundDecisionSchema().oneOf.find(
    (s) => (s.properties.action as { const: string }).const === value.action,
  );
  if (!branch) throw new LayoutRequestError("schema", "Expected design, revise or finish.", "/action");
  validateLayoutSchema(value, branch, "/");
  const decision = value as unknown as CompoundAiDecision;
  if (!session.designed && decision.action !== "design")
    throw new LayoutRequestError("semantic", "Begin with a structural design.");
  const review = decision.review;
  if (
    session.designed &&
    (!review || review.candidateId !== session.candidateId || review.revision !== session.revision)
  )
    throw new LayoutRequestError(
      "semantic",
      "Review the supplied candidate and exact revision before changing or finishing it.",
    );
  if (!session.designed && review !== null)
    throw new LayoutRequestError("semantic", "Initial design has no candidate review; use null.");
  if (decision.action === "finish" && (!session.valid || decision.candidateId !== session.candidateId))
    throw new LayoutRequestError("semantic", "Finish only the legal candidate supplied for review.");
  if (
    decision.action === "revise" &&
    (decision.baseCandidateId !== session.candidateId || decision.baseRevision !== session.revision)
  )
    throw new LayoutRequestError("semantic", "Revise the supplied draft and exact revision.");
  if (decision.action !== "finish" && session.designed && !review?.problems.length)
    throw new LayoutRequestError(
      "semantic",
      "Name the design problem, intended change and expected effect before revising.",
    );
  return decision;
}
