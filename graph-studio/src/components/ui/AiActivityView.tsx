import { useEffect, useRef } from "react";
import type { AiActivity } from "../../app/ai/useAiActivity";

export default function AiActivityView({ activity, busy }: { activity?: AiActivity; busy: boolean }) {
  const reasoning = useRef<HTMLPreElement>(null);
  const follow = useRef(true);
  useEffect(() => { follow.current = true; }, [activity?.request]);
  useEffect(() => {
    if (reasoning.current && follow.current) reasoning.current.scrollTop = reasoning.current.scrollHeight;
  }, [activity?.reasoning]);
  if (!activity?.request) return null;
  return (
    <section className="ai-activity" aria-label="AI activity">
      <p role="status">
        {busy && activity.streaming
          ? activity.content
            ? "Receiving response…"
            : activity.reasoning
              ? "Model is thinking…"
              : "Waiting for model…"
          : "Model response"}{" "}
        · {activity.received.toLocaleString()} characters
      </p>
      {activity.reasoning && (
        <details open>
          <summary>Model reasoning</summary>
          {activity.reasoning.length >= 16000 && <small>Showing the latest 16,000 characters.</small>}
          <pre
            ref={reasoning}
            tabIndex={0}
            onScroll={(e) => {
              const el = e.currentTarget;
              follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
            }}
          >
            {activity.reasoning}
          </pre>
        </details>
      )}
      {activity.content && (
        <details>
          <summary>Response</summary>
          {activity.content.length >= 16000 && <small>Showing the latest 16,000 characters.</small>}
          <pre tabIndex={0}>{activity.content}</pre>
        </details>
      )}
    </section>
  );
}
