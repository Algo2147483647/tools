import type { TimelineViewSettings, TimelineMarkerSettings } from "../graph/timelineSettings";
import { sanitizeTimelineMarker } from "../graph/timelineSettings";
import ColorSetting from "./settings/ColorSetting";
import NumericSetting from "./settings/NumericSetting";
import { TimelineChoices } from "./TimelineSettingFields";

export default function TimelinePointSettings({
  settings,
  onChange,
  anchors = false,
}: {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
  anchors?: boolean;
}) {
  const key = anchors ? "anchorMarker" : "pointMarker";
  const marker = settings[key];
  const defaults = sanitizeTimelineMarker(undefined, anchors);
  const prefix = anchors ? "Anchor" : "Point";
  const change = (patch: Partial<TimelineMarkerSettings>) => onChange({ [key]: { ...marker, ...patch } });
  return (
    <section
      className={`settings-section timeline-settings-section ${anchors ? "timeline-anchor-settings" : "timeline-point-settings"}`}
    >
      <h3>{anchors ? "Time anchors" : "Point events"}</h3>
      <p>
        {anchors
          ? "Markers at interval boundaries and connection times; label leaders link text to its exact time."
          : "Style instant events independently from interval bars."}
      </p>
      <fieldset className="timeline-style-group">
        <legend>Marker</legend>
        <label className="timeline-check">
          <input type="checkbox" checked={marker.visible} onChange={(e) => change({ visible: e.target.checked })} />
          Show {anchors ? "anchor" : "point"} markers
        </label>
        {marker.visible && (
          <>
            <div className="timeline-control-row">
              <span>Shape</span>
              <TimelineChoices
                label={`${prefix} marker shape`}
                value={marker.shape}
                options={[
                  ...(anchors ? [{ value: "auto" as const, label: "Auto" }] : []),
                  { value: "circle", label: "Circle" },
                  { value: "square", label: "Square" },
                  { value: "diamond", label: "Diamond" },
                ]}
                onChange={(shape) => change({ shape })}
              />
            </div>
            {anchors && marker.shape === "auto" && (
              <p className="timeline-style-hint">Dots at starts and connection times; a cap at the interval end.</p>
            )}
            <NumericSetting
              label={`${prefix} marker size`}
              value={marker.size}
              defaultValue={defaults.size}
              min={0}
              max={120}
              onChange={(size) => change({ size })}
            />
            <ColorSetting
              label={`${prefix} fill`}
              value={marker.fill}
              defaultValue=""
              automatic={{ color: "#64748b", description: "Follows the event color." }}
              onChange={(fill) => change({ fill })}
            />
            <NumericSetting
              label={`${prefix} border width`}
              value={marker.borderWidth}
              defaultValue={defaults.borderWidth}
              min={0}
              max={20}
              step={0.5}
              onChange={(borderWidth) => change({ borderWidth })}
            />
            {marker.borderWidth > 0 && (
              <ColorSetting
                label={`${prefix} border color`}
                value={marker.borderColor}
                defaultValue=""
                automatic={{ color: "#ffffff", description: "Uses the canvas background." }}
                onChange={(borderColor) => change({ borderColor })}
              />
            )}
          </>
        )}
      </fieldset>
      {anchors && (
        <fieldset className="timeline-style-group">
          <legend>Label leaders</legend>
          <div className="timeline-control-row">
            <span>Line</span>
            <TimelineChoices
              label="Timeline label leader style"
              value={settings.leaderStyle}
              options={[
                { value: "none", label: "None" },
                { value: "solid", label: "Solid" },
                { value: "dashed", label: "Dashed" },
              ]}
              onChange={(leaderStyle) => onChange({ leaderStyle })}
            />
          </div>
          {settings.leaderStyle !== "none" && (
            <>
              <NumericSetting
                label="Leader width"
                value={settings.leaderWidth}
                defaultValue={0.7}
                min={0}
                max={20}
                step={0.1}
                onChange={(leaderWidth) => onChange({ leaderWidth })}
              />
              <ColorSetting
                label="Leader color"
                value={settings.leaderColor}
                defaultValue=""
                automatic={{ color: "#a6abb3", description: "Subtle gray; emphasized on focus." }}
                onChange={(leaderColor) => onChange({ leaderColor })}
              />
            </>
          )}
        </fieldset>
      )}
    </section>
  );
}
