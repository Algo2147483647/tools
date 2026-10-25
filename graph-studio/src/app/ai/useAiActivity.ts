import { useCallback, useEffect, useRef, useState } from "react";
import type { AiProgressEvent } from "../../ai/transport/streaming";
import { emptyAiActivity, updateAiActivity, type AiActivity } from "../../ai/transport/activity";
export type { AiActivity } from "../../ai/transport/activity";

/** Transient, bounded preview. Never added to graph files, undo or conversation memory. */
export function useAiActivity() {
  const [activity, setActivity] = useState<AiActivity>(emptyAiActivity);
  const pending = useRef(emptyAiActivity());
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const clear = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = undefined;
    pending.current = emptyAiActivity();
    setActivity(pending.current);
  }, []);
  const onProgress = useCallback((event: AiProgressEvent) => {
    pending.current = updateAiActivity(pending.current, event);
    if (event.type === "start" || event.type === "end") {
      clearTimeout(timer.current);
      timer.current = undefined;
      setActivity(pending.current);
      return;
    }
    if (timer.current === undefined)
      timer.current = setTimeout(() => {
        timer.current = undefined;
        setActivity(pending.current);
      }, 80);
  }, []);
  const finish = useCallback(() => onProgress({ type: "end" }), [onProgress]);
  useEffect(() => () => clearTimeout(timer.current), []);
  return { activity, onProgress, clear, finish };
}
