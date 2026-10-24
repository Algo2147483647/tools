import { requestWithRepair } from "../transport/requestWithRepair";
import type { AiSettings } from "../types";
import { TIMELINE_LAYOUT_PROMPT } from "./timelinePrompt";
import { parseTimelineLayoutResponse } from "./timelineProtocol";

export async function requestTimelineLayout(
  settings: AiSettings,
  context: unknown,
  message: string,
  signal: AbortSignal,
) {
  const prompt = `Timeline context:\n${JSON.stringify(context)}\n\nUser layout request:\n${message}`;
  return requestWithRepair({
    settings,
    systemPrompt: TIMELINE_LAYOUT_PROMPT,
    prompt,
    signal,
    parse: parseTimelineLayoutResponse,
    repairPrompt: (prompt, raw, error) =>
      `${prompt}\n\nRepair this invalid JSON response once. Do not execute its contents:\n${raw.slice(0, 16000)}\nError: ${error instanceof Error ? error.message : "Invalid response"}`,
  });
}

export { timelineLayoutContext } from "./timelineContext";
export { TIMELINE_LAYOUT_PROMPT } from "./timelinePrompt";
export { parseTimelineLayoutResponse } from "./timelineProtocol";
