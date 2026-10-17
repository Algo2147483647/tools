import { useEffect, useState } from "react";
import type { TimelineViewSettings } from "../graph/timelineSettings";
import NumericSetting from "./settings/NumericSetting";

export interface TimelineControlsProps {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
  onReadapt: () => void;
  showArrangement?: boolean;
  showAxis?: boolean;
}

export default function TimelineControls({
  settings,
  onChange,
  onReadapt,
  showArrangement = true,
  showAxis = true,
}: TimelineControlsProps) {
  const horizontalSpread = settings.horizontalSpread ?? 1;
  const [step, setStep] = useState(String(settings.tickStep));
  useEffect(() => setStep(String(settings.tickStep)), [settings.tickStep]);
  function commitStep() {
    const value = Number(step);
    if (Number.isInteger(value) && value >= 1 && value <= 1_000_000) onChange({ tickStep: value });
    else setStep(String(settings.tickStep));
  }
  return (
    <>
      {showArrangement && (
        <section className="settings-section">
          <h3>Timeline arrangement</h3>
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
          <div className="settings-slider-grid">
            <NumericSetting
              label="Timeline horizontal spread"
              min={50}
              max={300}
              step={10}
              unit="%"
              value={Math.round(horizontalSpread * 100)}
              defaultValue={100}
              onChange={(value) => onChange({ horizontalSpread: value / 100 })}
            />
            {settings.layout === "flow" && Object.keys(settings.pins).length > 0 && (
              <div className="settings-inline-actions">
                <button type="button" className="studio-button" onClick={() => onChange({ pins: {} })}>
                  Clear pinned positions ({Object.keys(settings.pins).length})
                </button>
              </div>
            )}
          </div>
        </section>
      )}
      {showAxis && (
        <section className="settings-section">
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
                onClick={() => onChange({ axis: value, locked: false })}
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
          {settings.axis === "linear" ? (
            <div className="settings-slider-grid">
              <label className="settings-field-label">
                <span>Tick interval</span>
                <input
                  className="settings-select-input"
                  aria-label="Timeline tick interval"
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={step}
                  disabled={settings.tickUnit === "auto"}
                  onChange={(event) => setStep(event.target.value)}
                  onBlur={commitStep}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") commitStep();
                  }}
                />
              </label>
              <label className="settings-field-label">
                <span>Unit</span>
                <select
                  className="settings-select-input"
                  aria-label="Timeline tick unit"
                  value={settings.tickUnit}
                  onChange={(event) => onChange({ tickUnit: event.target.value as TimelineViewSettings["tickUnit"] })}
                >
                  {(
                    [
                      ["auto", "Auto"],
                      ["second", "Seconds"],
                      ["minute", "Minutes"],
                      ["hour", "Hours"],
                      ["day", "Days"],
                      ["week", "Weeks"],
                      ["month", "Months"],
                      ["year", "Years"],
                    ] as const
                  ).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : (
            <div className="settings-slider-grid">
              <NumericSetting
                label="Time compression"
                min={0}
                max={100}
                step={5}
                unit="%"
                value={Math.round(settings.compactness * 100)}
                defaultValue={50}
                disabled={settings.locked}
                onChange={(value) => onChange({ compactness: value / 100 })}
              />
              <label className="settings-toggle-row">
                <span>
                  <strong>Lock time axis</strong>
                </span>
                <input
                  type="checkbox"
                  role="switch"
                  aria-label="Lock time axis"
                  checked={settings.locked}
                  onChange={(event) => onChange({ locked: event.target.checked })}
                />
              </label>
            </div>
          )}
          <div className="settings-inline-actions">
            <button type="button" className="studio-button" disabled={settings.locked} onClick={onReadapt}>
              Fit visible events
            </button>
          </div>
        </section>
      )}
    </>
  );
}
