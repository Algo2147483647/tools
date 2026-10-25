import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import { requestLayoutPlan } from "../../shared/ai/request";
import { TIMELINE_LAYOUT_PROMPT } from "./prompt";
import { timelineDecisionSchema, parseTimelineDecision } from "./decision";

export async function requestTimelineLayout(
  settings: AiSettings,
  context: unknown,
  message: string,
  signal: AbortSignal,
  onProgress?: AiProgressListener,
  session: { candidates: ReadonlySet<string>; requireEvaluation: boolean } = {
    candidates: new Set(["current"]),
    requireEvaluation: true,
  },
) {
  return requestLayoutPlan({
    purpose: "layout-planning",
    settings,
    context,
    message,
    signal,
    onProgress,
    schema: timelineDecisionSchema(),
    instructions: TIMELINE_LAYOUT_PROMPT,
    parse: (value) => parseTimelineDecision(value, session.candidates, session.requireEvaluation),
  });
}
