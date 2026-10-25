import type { AiProgressEvent } from "./streaming";

export interface AiActivityEntry {
  reasoning: string;
  content: string;
  received: number;
  request: number;
  streaming: boolean;
}
export interface AiActivity extends AiActivityEntry {
  history: AiActivityEntry[];
}
export const emptyAiActivity = (): AiActivity => ({
  reasoning: "",
  content: "",
  received: 0,
  request: 0,
  streaming: false,
  history: [],
});

/** Bounded, session-only transcript of all requests in the current run. */
export function updateAiActivity(current: AiActivity, event: AiProgressEvent): AiActivity {
  if (event.type === "start") {
    const { history, ...previous } = current;
    return {
      ...emptyAiActivity(),
      request: current.request + 1,
      streaming: true,
      history: current.request ? [...history, { ...previous, streaming: false }].slice(-15) : history,
    };
  }
  if (event.type === "end") return { ...current, streaming: false };
  return {
    ...current,
    [event.type]: (current[event.type] + event.text).slice(-16000),
    received: current.received + event.text.length,
  };
}
