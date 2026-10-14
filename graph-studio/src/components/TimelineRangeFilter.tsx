import { useEffect, useRef, useState } from "react";
import { parseTimelineRangeInput, timelineRangeDates, type TimelineTimeRange } from "../graph/timelineRange";

export default function TimelineRangeFilter({
  range,
  onChange,
}: {
  range: TimelineTimeRange | null;
  onChange: (range: TimelineTimeRange | null) => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  const [draft, setDraft] = useState(() => timelineRangeDates(range));
  const [error, setError] = useState("");
  useEffect(() => {
    setDraft(timelineRangeDates(range));
    setError("");
  }, [range]);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current?.open && event.target instanceof Node && !details.current.contains(event.target))
        details.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const active = timelineRangeDates(range);
  return (
    <details
      ref={details}
      className="timeline-range-filter"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current) {
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary
        className={`studio-icon-button${range ? " is-active" : ""}`}
        aria-label="Time range"
        title={range ? `Time range: ${active.from || "Beginning"} to ${active.to || "End"}` : "Filter by time range"}
      >
        <svg
          viewBox="0 0 24 24"
          className="topbar-icon-svg"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M7 3v4m10-4v4M3 10h18m-13 5h8" />
        </svg>
      </summary>
      <form
        className="timeline-range-popover"
        aria-label="Timeline time range"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const dates = { from: String(form.get("from") || ""), to: String(form.get("to") || "") };
          setDraft(dates);
          const result = parseTimelineRangeInput(dates.from, dates.to);
          if (!result.ok) {
            setError(result.error);
            return;
          }
          onChange(result.range);
          if (details.current) details.current.open = false;
        }}
      >
        <strong>Time range</strong>
        <p>UTC years, months or dates. To includes the full period. For 221 BCE, enter -000220.</p>
        <div className="timeline-range-dates">
          <label>
            From
            <input
              aria-label="Timeline from date"
              name="from"
              type="text"
              placeholder="YYYY / YYYY-MM / YYYY-MM-DD"
              value={draft.from}
              onChange={(event) => {
                setDraft({ ...draft, from: event.currentTarget.value });
                setError("");
              }}
            />
          </label>
          <label>
            To
            <input
              aria-label="Timeline to date"
              name="to"
              type="text"
              placeholder="YYYY / YYYY-MM / YYYY-MM-DD"
              value={draft.to}
              onChange={(event) => {
                setDraft({ ...draft, to: event.currentTarget.value });
                setError("");
              }}
            />
          </label>
        </div>
        {error && (
          <p className="timeline-range-error" role="alert">
            {error}
          </p>
        )}
        <p>Crossing events remain visible with clipped ends. Undated events are hidden while a range is active.</p>
        <div className="timeline-range-actions">
          <button
            className="studio-button"
            type="button"
            onClick={() => {
              onChange(null);
              setDraft({ from: "", to: "" });
              setError("");
            }}
          >
            Clear
          </button>
          <button className="studio-button" type="submit">
            Apply
          </button>
        </div>
      </form>
    </details>
  );
}
