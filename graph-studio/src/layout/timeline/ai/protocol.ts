import { parseTimelineLayoutPlan } from "../../../graph/timeline/layoutData";
import { LayoutRequestError, layoutObject, parseLayoutJson } from "../../shared/ai/request";

const point = {
  type: "object",
  additionalProperties: false,
  required: ["x", "y"],
  properties: { x: { type: "number" }, y: { type: "number" } },
};
export const TIMELINE_AI_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["version", "plan"],
  properties: {
    version: { type: "integer", enum: [1] },
    plan: {
      type: "object",
      additionalProperties: false,
      properties: {
        trackOrder: { type: "array", items: { type: "string" } },
        eventOrder: { type: "array", items: { type: "string" } },
        placements: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "cross"],
            properties: {
              id: { type: "string" },
              cross: { type: "number" },
              label: point,
            },
          },
        },
        routes: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "points"],
            properties: {
              id: { type: "string" },
              points: { type: "array", minItems: 2, items: point },
              label: point,
            },
          },
        },
        edgeRouting: { type: "string", enum: ["avoid", "direct"] },
      },
    },
  },
};
export function parseTimelineLayoutResponse(
  raw: string | Record<string, unknown>,
  policy?: { events: ReadonlySet<string>; tracks: ReadonlySet<string> },
) {
  const value = layoutObject(
    typeof raw === "string" ? parseLayoutJson({ content: raw }) : raw,
    ["version", "plan"],
    "",
  );
  if (value.version !== 1) throw new LayoutRequestError("schema", "Expected version 1.", "/version");
  const planValue = layoutObject(
    value.plan,
    ["trackOrder", "eventOrder", "edgeRouting", "placements", "routes"],
    "/plan",
  );
  let plan;
  try {
    plan = parseTimelineLayoutPlan(planValue);
  } catch (cause) {
    throw new LayoutRequestError("schema", cause instanceof Error ? cause.message : "Invalid plan.", "/plan");
  }
  if (policy)
    for (const [key, known] of [
      ["trackOrder", policy.tracks],
      ["eventOrder", policy.events],
    ] as const) {
      plan[key].forEach((id, i) => {
        if (!known.has(id)) throw new LayoutRequestError("semantic", "Use a supplied name or ID.", `/plan/${key}/${i}`);
      });
    }
  return { plan };
}

export const TIMELINE_DECISION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["version", "action"],
  properties: {
    ...(TIMELINE_AI_SCHEMA.properties as object),
    action: { type: "string", enum: ["evaluate", "finish"] },
    hypothesis: { type: "string" },
    candidateId: { type: "string" },
    summary: { type: "string" },
  },
};
export function parseTimelineDecision(value: Record<string, unknown>, candidates: ReadonlySet<string>) {
  layoutObject(value, ["version", "action", "plan", "hypothesis", "candidateId", "summary"], "");
  if (value.version !== 1) throw new LayoutRequestError("schema", "Expected version 1.");
  if (value.action === "finish") {
    if (
      typeof value.candidateId !== "string" ||
      !candidates.has(value.candidateId) ||
      typeof value.summary !== "string" ||
      !value.summary.trim()
    )
      throw new LayoutRequestError("semantic", "Select an evaluated candidate and explain the result.");
    return { action: "finish" as const, candidateId: value.candidateId, summary: value.summary };
  }
  if (value.action !== "evaluate" || typeof value.hypothesis !== "string")
    throw new LayoutRequestError(
      "schema",
      "Use evaluate with a plan and hypothesis, or finish with candidateId and summary.",
    );
  return {
    action: "evaluate" as const,
    hypothesis: value.hypothesis,
    plan: parseTimelineLayoutResponse({ version: 1, plan: value.plan }).plan,
  };
}
