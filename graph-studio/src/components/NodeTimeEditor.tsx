import { sanitizeTimelineClock, timelineClockCaption, type TimelineClock } from "../graph/timelineClock";
import { parseNodeTimeline } from "../graph/timeline";

interface NodeTimeEditorProps {
  time: unknown;
  clock?: TimelineClock;
  status?: unknown;
  onStatusChange?: (value: string) => void;
  track: unknown;
  readOnly: boolean;
  referenceTime?: number;
  onChange: (time: unknown, track: string) => void;
}

/** Keep incomplete text in the draft; only Save commits and validates it. */
export default function NodeTimeEditor({
  time,
  track,
  readOnly,
  referenceTime,
  clock = sanitizeTimelineClock(null),
  status,
  onStatusChange,
  onChange,
}: NodeTimeEditorProps) {
  const value = time && typeof time === "object" && !Array.isArray(time) ? (time as Record<string, unknown>) : {};
  const mode = time === undefined ? "none" : "at" in value ? "instant" : value.end === null ? "ongoing" : "range";
  const relative = clock.mode === "relative";
  const start = value.at ?? value.start ?? "";
  const end = value.end ?? "";
  const inputValue = (v: unknown) => (typeof v === "number" || typeof v === "string" ? String(v) : "");
  const numeric = (v: unknown) =>
    relative && typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
  const makeTime = (next: string, from: unknown, to: unknown) =>
    next === "none"
      ? undefined
      : {
          ...(relative ? { basis: "relative" } : {}),
          ...(next === "instant"
            ? { at: numeric(from) }
            : { start: numeric(from), end: next === "ongoing" ? null : numeric(to) }),
        };
  const trackName = typeof track === "string" ? track : "";
  const parsed = parseNodeTimeline({ time }, referenceTime, clock);

  return (
    <section className="node-detail-section">
      <h2 className="node-detail-section-title">Event time & track</h2>
      {readOnly ? (
        <>
          <p className="node-detail-text">{parsed.label}</p>
          <p className="node-detail-editor-hint">Track: {trackName || "Automatic"}</p>
          {parsed.status === "invalid" && <p className="node-detail-error">{parsed.message}</p>}
        </>
      ) : (
        <>
          <div className="node-time-editor">
            <label>
              Event kind
              <select
                className="node-detail-editor"
                aria-label="Event time kind"
                value={mode}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  onChange(makeTime(next, start, end), trackName);
                }}
              >
                <option value="none">Undated</option>
                <option value="instant">Instant event</option>
                <option value="range">Time interval</option>
                {!relative && <option value="ongoing">Ongoing event</option>}
              </select>
            </label>
            <label>
              Track (optional)
              <input
                className="node-detail-editor"
                aria-label="Event track"
                value={trackName}
                placeholder="Automatic"
                onChange={(event) => onChange(time, event.currentTarget.value)}
              />
            </label>
            {onStatusChange && (
              <label>
                Status
                <select
                  className="node-detail-editor"
                  aria-label="Event status"
                  value={typeof status === "string" ? status : ""}
                  onChange={(e) => onStatusChange(e.currentTarget.value)}
                >
                  <option value="">Category color</option>
                  {typeof status === "string" &&
                    status &&
                    !["planned", "active", "completed", "blocked"].includes(status) && (
                      <option value={status}>{status}</option>
                    )}
                  <option value="planned">Planned</option>
                  <option value="active">Active</option>
                  <option value="completed">Completed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </label>
            )}
            {mode !== "none" && (
              <label>
                {mode === "instant" ? "Time" : "Start"}
                <input
                  className="node-detail-editor"
                  aria-label={mode === "instant" ? "Event time" : "Event start"}
                  type="text"
                  spellCheck={false}
                  placeholder={relative ? "0 / -2 / 0.5" : "1969-07-16 or 1969-07-16T13:32:00Z"}
                  value={inputValue(start)}
                  onChange={(event) => onChange(makeTime(mode, event.currentTarget.value, end), trackName)}
                />
              </label>
            )}
            {mode === "range" && (
              <label>
                End
                <input
                  className="node-detail-editor"
                  aria-label="Event end"
                  type="text"
                  spellCheck={false}
                  placeholder={relative ? "6" : "1969-07-24T16:50:35Z"}
                  value={inputValue(end)}
                  onChange={(event) => onChange(makeTime("range", start, event.currentTarget.value), trackName)}
                />
              </label>
            )}
          </div>
          <p className="node-detail-editor-hint">
            {relative
              ? `${timelineClockCaption(clock)} · Numeric values support zero, negatives and decimals.`
              : `Use YYYY, YYYY-MM or YYYY-MM-DD; ISO date-times require Z or an offset. BCE uses astronomical years (221 BCE = -000220). Ongoing events extend to ${referenceTime === undefined ? "the current time" : new Date(referenceTime).toISOString()}.`}
          </p>
          {parsed.status === "invalid" && (
            <p className="node-detail-error" role="status">
              {parsed.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
