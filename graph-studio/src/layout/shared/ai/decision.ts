import type { GraphChartType } from "../../../graph/types";
import { layoutResultSchema, parseLayoutResult, type LayoutResultDocument } from "../../../schema/layoutResult";
import { LayoutRequestError, layoutObject } from "./request";

export type LayoutDecision =
  | { action: "evaluate"; hypothesis: string; layout: LayoutResultDocument }
  | { action: "finish"; candidateId: string; summary: string };
export function layoutDecisionSchema(chart: GraphChartType) {
  return {
    oneOf: [
      {
        type: "object",
        additionalProperties: false,
        required: ["action", "hypothesis", "layout"],
        properties: {
          action: { const: "evaluate" },
          hypothesis: { type: "string" },
          layout: layoutResultSchema(chart),
        },
      },
      {
        type: "object",
        additionalProperties: false,
        required: ["action", "candidateId", "summary"],
        properties: { action: { const: "finish" }, candidateId: { type: "string" }, summary: { type: "string" } },
      },
    ],
  };
}
export function parseLayoutDecision(
  value: Record<string, unknown>,
  chart: GraphChartType,
  candidates: ReadonlySet<string>,
  requireEvaluation: boolean,
): LayoutDecision {
  const text = (v: unknown) => {
    if (typeof v !== "string" || !v.trim())
      throw new LayoutRequestError("schema", "Expected a nonempty explanation or candidate ID.");
    return v;
  };
  if (value.action === "evaluate") {
    layoutObject(value, ["action", "hypothesis", "layout"], "/");
    return { action: "evaluate", hypothesis: text(value.hypothesis), layout: parseLayoutResult(value.layout, chart) };
  }
  if (value.action !== "finish") throw new LayoutRequestError("schema", "Expected evaluate or finish.");
  layoutObject(value, ["action", "candidateId", "summary"], "/");
  const candidateId = text(value.candidateId);
  if (requireEvaluation) throw new LayoutRequestError("semantic", "Evaluate a proposal before finishing.");
  if (!candidates.has(candidateId))
    throw new LayoutRequestError("semantic", "Select a successfully evaluated candidate.");
  return { action: "finish", candidateId, summary: text(value.summary) };
}
