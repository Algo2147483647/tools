import { sanitizeTimelineClock,type TimelineClock } from "../graph/timeline/clock";
import type { TimelineViewSettings } from "../graph/timeline/settings";
import { getDefaultChartStyle } from "../schema/chartStyles";
import NumericSetting from "./settings/NumericSetting";
import { TimelineChoices,TimelineNumberField } from "./TimelineSettingFields";

export interface TimelineControlsProps {
  settings: TimelineViewSettings;
  clock?: TimelineClock;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
  onReadapt: () => void;
  showArrangement?: boolean;
  showAxis?: boolean;
  showRouting?: boolean;
}

export default function TimelineControls({
  settings,
  clock = sanitizeTimelineClock(null),
  onChange,
  onReadapt,
  showArrangement = true,
  showAxis = true,
  showRouting = true,
}: TimelineControlsProps) {
  return (
    <>
      {showArrangement && (
        <section className="settings-section timeline-settings-section">
          <h3>Timeline arrangement</h3>
          <div className="timeline-control-row">
            <span>Direction</span>
            <TimelineChoices
              schemaPath="orientation"
              label="Timeline orientation"
              value={settings.orientation}
              options={[
                {
                  value: "vertical",
                  label: "Vertical",
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path d="M8 2v12m-4-4 4 4 4-4" />
                    </svg>
                  ),
                },
                {
                  value: "horizontal",
                  label: "Horizontal",
                  icon: (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      aria-hidden="true"
                    >
                      <path d="M2 8h12m-4-4 4 4-4 4" />
                    </svg>
                  ),
                },
              ]}
              onChange={(orientation) => onChange({ orientation })}
            />
          </div>
          <div className="layout-engine-grid" role="group" aria-label="Timeline arrangement">
            {(
              [
                ["tracks", "Tracks"],
                ["flow", "Relation flow"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.layout === value ? "is-selected" : ""}
                aria-pressed={settings.layout === value}
                onClick={() => onChange({ layout: value })}
              >
                <svg
                  width="64"
                  height="32"
                  viewBox="0 0 64 32"
                  fill="none"
                  stroke="#99b4df"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  {value === "tracks" ? (
                    <>
                      <path d="M12 2v28M32 2v28M52 2v28" />
                      <path d="M12 9h20v13h20" />
                      <circle cx="12" cy="9" r="3" fill="#edf3ff" />
                      <circle cx="32" cy="22" r="3" fill="#edf3ff" />
                      <circle cx="52" cy="22" r="3" fill="#edf3ff" />
                    </>
                  ) : (
                    <>
                      <path d="M32 3L10 16L32 29M32 3L54 16L32 29" />
                      {[
                        [32, 3],
                        [10, 16],
                        [54, 16],
                        [32, 29],
                      ].map(([x, y]) => (
                        <circle key={`${x}:${y}`} cx={x} cy={y} r="3" fill="#edf3ff" />
                      ))}
                    </>
                  )}
                </svg>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
          {settings.layout === "flow" && Object.keys(settings.pins).length > 0 && (
            <button type="button" className="timeline-text-action" onClick={() => onChange({ pins: {} })}>
              Clear pinned positions ({Object.keys(settings.pins).length})
            </button>
          )}
        </section>
      )}
      {showRouting && (
        <section className="settings-section timeline-settings-section">
          <h3>Connections</h3>
          <div className="timeline-control-row">
            <span>Routing</span>
            <TimelineChoices
              schemaPath="edgeRouting"
              label="Timeline edge routing"
              value={settings.edgeRouting}
              options={[
                { value: "direct", label: "Direct" },
                { value: "avoid", label: "Avoid obstacles" },
              ]}
              onChange={(edgeRouting) => onChange({ edgeRouting })}
            />
          </div>
          <p>Direct connects time anchors with a straight line. Avoid obstacles routes around interval bars.</p>
        </section>
      )}
      {showAxis && (
        <section className="settings-section timeline-settings-section">
          <h3>Time axis</h3>
          <div className="layout-engine-grid" role="group" aria-label="Timeline axis mode">
            {(
              [
                ["linear", "Fixed interval"],
                ["adaptive", "Adaptive"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={settings.axis === value ? "is-selected" : ""}
                aria-pressed={settings.axis === value}
                onClick={() => onChange({ axis: value })}
              >
                <svg
                  width="64"
                  height="32"
                  viewBox="0 0 64 32"
                  fill="none"
                  stroke="#99b4df"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <path d="M3 16h58" />
                  {(value === "linear" ? [7, 19, 31, 43, 55] : [7, 13, 23, 42, 55]).map((x) => (
                    <path key={x} d={`M${x} 10v12`} />
                  ))}
                </svg>
                <strong>{label}</strong>
              </button>
            ))}
          </div>
          {clock.mode !== "relative" && settings.axis === "linear" && (
            <div className="timeline-field-grid timeline-tick-fields">
              <TimelineNumberField
                label="Tick interval"
                ariaLabel="Timeline tick interval"
                value={settings.tickStep}
                onChange={(tickStep) => onChange({ tickStep })}
              />
              <label className="timeline-field">
                <span>Unit</span>
                <select
                  aria-label="Timeline tick unit"
                  value={settings.tickUnit}
                  onChange={(e) => onChange({ tickUnit: e.target.value as TimelineViewSettings["tickUnit"] })}
                >
                  {(["auto", "second", "minute", "hour", "day", "week", "month", "year"] as const).map((unit) => (
                    <option key={unit} value={unit}>
                      {unit === "auto" ? "Auto" : unit[0].toUpperCase() + unit.slice(1) + "s"}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          {settings.axis === "adaptive" && (
            <NumericSetting
              label="Time compression"
              min={0}
              max={100}
              step={5}
              unit="%"
              value={settings.compactness * 100}
              defaultValue={timelineDefaults.compactness * 100}
              disabled={settings.locked}
              onChange={(value) => onChange({ compactness: value / 100 })}
            />
          )}
          <div className="timeline-axis-actions">
            <label>
              <input
                type="checkbox"
                role="switch"
                aria-label="Lock time axis"
                checked={settings.locked}
                onChange={(e) => onChange({ locked: e.target.checked })}
              />
              Lock axis
            </label>
            <button type="button" className="timeline-text-action" disabled={settings.locked} onClick={onReadapt}>
              Fit visible events
            </button>
          </div>
        </section>
      )}
    </>
  );
}

const timelineDefaults = getDefaultChartStyle("timeline").timeline!;
