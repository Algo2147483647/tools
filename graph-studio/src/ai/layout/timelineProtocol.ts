import { parseTimelineLayoutPlan } from "../../graph/timeline/layoutData";
import { isRecord } from "../../utils/json";

export function parseTimelineLayoutResponse(raw: string) {
  const text = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");
  const value: unknown = JSON.parse(text);
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    typeof value.explanation !== "string" ||
    value.explanation.length > 4000 ||
    Object.keys(value).some((key) => !["version", "explanation", "plan"].includes(key))
  )
    throw new Error("Invalid timeline layout response.");
  return { explanation: value.explanation, plan: parseTimelineLayoutPlan(value.plan) };
}
