import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import { LayoutRequestError, requestLayoutPlan } from "../../shared/ai/request";
import { TIMELINE_LAYOUT_PROMPT } from "./prompt";
import { parseTimelineDecision, TIMELINE_DECISION_SCHEMA } from "./protocol";

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
    schema: TIMELINE_DECISION_SCHEMA,
    instructions: TIMELINE_LAYOUT_PROMPT,
    parse: (value) => {
      const decision = parseTimelineDecision(value, session.candidates);
      if (decision.action === "finish" && session.requireEvaluation)
        throw new LayoutRequestError("semantic", "Evaluate a proposal before finishing.");
      return decision;
    },
  });
}
