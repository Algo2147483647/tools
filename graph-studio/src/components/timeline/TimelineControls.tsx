import { sanitizeTimelineClock, type TimelineClock } from "../../graph/timeline/clock";
import type { TimelineViewSettings } from "../../graph/timeline/settings";
import { getDefaultChartStyle } from "../../schema/chartStyles";
import LayoutRules, { type LayoutRule } from "../arrange/LayoutRules";
import NumericSetting from "../settings/NumericSetting";
import { TimelineNumberField } from "./TimelineSettingFields";

export interface TimelineControlsProps {
  settings: TimelineViewSettings;
  clock?: TimelineClock;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
  onReadapt: () => void;
  showArrangement?: boolean;
  showLayoutChoice?: boolean;
  showAxis?: boolean;
  showRouting?: boolean;
}
export default function TimelineControls({
  settings,
  clock = sanitizeTimelineClock(null),
  onChange,
  onReadapt,
  showArrangement = true,
  showLayoutChoice = true,
  showAxis = true,
  showRouting = true,
}: TimelineControlsProps) {
  const rows: LayoutRule[] = [];
  if (showArrangement) {
    rows.push({
      label: "Direction",
      value: (
        <select
          aria-label="Timeline orientation"
          value={settings.orientation}
          onChange={(e) => onChange({ orientation: e.target.value as TimelineViewSettings["orientation"] })}
        >
          <option value="vertical">Vertical</option>
          <option value="horizontal">Horizontal</option>
        </select>
      ),
    });
    if (showLayoutChoice)
      rows.push({
        label: "Arrangement",
        value: (
          <select
            aria-label="Timeline arrangement"
            value={settings.layout}
            onChange={(e) => onChange({ layout: e.target.value as TimelineViewSettings["layout"] })}
          >
            <option value="tracks">Tracks</option>
            <option value="flow">Relation flow</option>
          </select>
        ),
      });
  }
  if (showRouting)
    rows.push({
      label: "Connections",
      value: (
        <select
          aria-label="Timeline edge routing"
          value={settings.edgeRouting}
          onChange={(e) => onChange({ edgeRouting: e.target.value as TimelineViewSettings["edgeRouting"] })}
        >
          <option value="avoid">Avoid obstacles</option>
          <option value="direct">Direct</option>
        </select>
      ),
    });
  if (showAxis) {
    rows.push({
      label: "Time axis",
      value: (
        <select
          aria-label="Timeline axis mode"
          value={settings.axis}
          onChange={(e) => onChange({ axis: e.target.value as TimelineViewSettings["axis"] })}
        >
          <option value="linear">Fixed interval</option>
          <option value="adaptive">Adaptive</option>
        </select>
      ),
    });
    if (settings.axis === "linear") {
      rows.push({
        label: "Tick interval",
        value: (
          <TimelineNumberField
            label="Interval"
            ariaLabel="Timeline tick interval"
            value={clock.mode === "relative" ? settings.relativeTickStep : settings.tickStep}
            onChange={(value) =>
              onChange(clock.mode === "relative" ? { relativeTickStep: value } : { tickStep: value })
            }
          />
        ),
      });
      if (clock.mode !== "relative")
        rows.push({
          label: "Tick unit",
          value: (
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
          ),
        });
    } else
      rows.push({
        label: "Compression",
        value: (
          <NumericSetting
            label="Time compression"
            min={0}
            max={100}
            step={5}
            unit="%"
            value={settings.compactness * 100}
            defaultValue={getDefaultChartStyle("timeline").timeline!.compactness * 100}
            disabled={settings.locked}
            onChange={(value) => onChange({ compactness: value / 100 })}
          />
        ),
      });
    rows.push({
      label: "Axis lock",
      value: (
        <label className="layout-rule-check">
          <input
            type="checkbox"
            role="switch"
            aria-label="Lock time axis"
            checked={settings.locked}
            onChange={(e) => onChange({ locked: e.target.checked })}
          />
          Lock axis
        </label>
      ),
    });
  }
  return (
    <div className="timeline-layout-rules">
      <LayoutRules rows={rows} label="Timeline layout rules" />
      <div className="layout-actions">
        {showAxis && (
          <button className="studio-button" type="button" disabled={settings.locked} onClick={onReadapt}>
            Fit visible events
          </button>
        )}
        {showArrangement && settings.layout === "flow" && Object.keys(settings.pins).length > 0 && (
          <button className="studio-button" type="button" onClick={() => onChange({ pins: {} })}>
            Clear pins ({Object.keys(settings.pins).length})
          </button>
        )}
      </div>
    </div>
  );
}
