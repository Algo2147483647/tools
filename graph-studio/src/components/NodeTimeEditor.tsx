import { parseTimelineTime } from "../graph/timeline";

interface NodeTimeEditorProps {
  time: unknown;
  track: unknown;
  readOnly: boolean;
  referenceTime?: number;
  onChange: (time: unknown, track: string) => void;
}

/** Keep incomplete text in the draft; only Save commits and validates it. */
export default function NodeTimeEditor({ time, track, readOnly, referenceTime, onChange }: NodeTimeEditorProps) {
  const value = time && typeof time === "object" && !Array.isArray(time) ? (time as Record<string, unknown>) : {};
  const mode = time === undefined ? "none" : "at" in value ? "instant" : value.end === null ? "ongoing" : "range";
  const start = typeof value.at === "string" ? value.at : typeof value.start === "string" ? value.start : "";
  const end = typeof value.end === "string" ? value.end : "";
  const trackName = typeof track === "string" ? track : "";
  const parsed = parseTimelineTime(time, referenceTime);

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
                  onChange(
                    next === "none"
                      ? undefined
                      : next === "instant"
                        ? { at: start }
                        : { start, end: next === "ongoing" ? null : end },
                    trackName,
                  );
                }}
              >
                <option value="none">Undated</option>
                <option value="instant">Instant event</option>
                <option value="range">Time interval</option>
                <option value="ongoing">Ongoing event</option>
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
            {mode !== "none" && (
              <label>
                {mode === "instant" ? "Time" : "Start"}
                <input
                  className="node-detail-editor"
                  aria-label={mode === "instant" ? "Event time" : "Event start"}
                  type="text"
                  spellCheck={false}
                  placeholder="1969-07-16 or 1969-07-16T13:32:00Z"
                  value={start}
                  onChange={(event) =>
                    onChange(
                      mode === "instant"
                        ? { at: event.currentTarget.value }
                        : { start: event.currentTarget.value, end: mode === "ongoing" ? null : end },
                      trackName,
                    )
                  }
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
                  placeholder="1969-07-24T16:50:35Z"
                  value={end}
                  onChange={(event) => onChange({ start, end: event.currentTarget.value }, trackName)}
                />
              </label>
            )}
          </div>
          <p className="node-detail-editor-hint">
            Use YYYY-MM-DD for day precision, or an ISO date-time with Z or an explicit offset such as +08:00. The axis
            displays UTC. Ongoing events extend to{" "}
            {referenceTime === undefined
              ? "the current time"
              : `the saved reference time, ${new Date(referenceTime).toISOString()}`}
            .
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
