import { useCallback, useEffect, useRef, useState } from "react";
import type { AiProgressEvent } from "../../ai/transport/streaming";

export interface AiActivity {
  reasoning: string;
  content: string;
  received: number;
  request: number;
  streaming: boolean;
}
const empty = (): AiActivity => ({ reasoning: "", content: "", received: 0, request: 0, streaming: false });
/** Transient, bounded preview. Never added to graph files, undo or conversation memory. */
export function useAiActivity() {
  const [activity, setActivity] = useState<AiActivity>(empty);
  const pending = useRef(empty());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    pending.current = empty();
    setActivity(pending.current);
  }, []);
  const onProgress = useCallback((event: AiProgressEvent) => {
    if (event.type === "start") pending.current = { ...empty(), request: pending.current.request + 1, streaming: true };
    else if (event.type === "end") pending.current = { ...pending.current, streaming: false };
    else
      pending.current = {
        ...pending.current,
        [event.type]: (pending.current[event.type] + event.text).slice(-16000),
        received: pending.current.received + event.text.length,
      };
    if (timer.current === undefined)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setActivity(pending.current);
      }, 80);
  }, []);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { activity, onProgress, clear };
}
