import { parseTimelineLayoutPlan } from "../../../graph/timeline/layoutData";
import { LayoutRequestError, layoutObject, parseLayoutJson } from "../../shared/ai/request";

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
  const planValue = layoutObject(value.plan, ["trackOrder", "eventOrder", "edgeRouting"], "/plan");
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
