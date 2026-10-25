import type { AiSettings } from "../../../ai/types";
import { requestLayoutPlan } from "../../shared/ai/request";
import type { timelineLayoutContext } from "./context";
import { TIMELINE_LAYOUT_PROMPT } from "./prompt";
import { parseTimelineLayoutResponse, TIMELINE_AI_SCHEMA } from "./protocol";

export async function requestTimelineLayout(
  settings: AiSettings,
  context: ReturnType<typeof timelineLayoutContext>,
  message: string,
  signal: AbortSignal,
) {
  return requestLayoutPlan({
    settings,
    context,
    message,
    signal,
    schema: TIMELINE_AI_SCHEMA,
    instructions: TIMELINE_LAYOUT_PROMPT,
    parse: (value) =>
      parseTimelineLayoutResponse(value, {
        events: new Set(context.events.map((e) => e.id)),
        tracks: new Set(context.tracks.map((t) => t.name)),
      }),
  });
}
