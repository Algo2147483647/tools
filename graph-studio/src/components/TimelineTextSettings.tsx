import type { TimelineViewSettings } from "../graph/timelineSettings";
import ColorSetting from "./settings/ColorSetting";
import { TimelineAlignmentIcon, TimelineChoices } from "./TimelineSettingFields";

interface TimelineTextSettingsProps {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
}

export function TimelinePointTextSettings({ settings, onChange }: TimelineTextSettingsProps) {
  return (
    <section className="settings-section timeline-settings-section timeline-point-text-settings">
      <h3>Point text</h3>
      <fieldset className="timeline-style-group">
        <legend>Title &amp; time</legend>
        <ColorSetting
          label="Point title color"
          value={settings.pointTextColor}
          defaultValue=""
          automatic={{ color: "#18212f", description: "Uses the theme title color." }}
          onChange={(pointTextColor) => onChange({ pointTextColor })}
        />
        <label className="timeline-check">
          <input
            type="checkbox"
            checked={settings.pointDateVisible}
            onChange={(e) => onChange({ pointDateVisible: e.target.checked })}
          />
          Show point time label
        </label>
        {settings.pointDateVisible && (
          <ColorSetting
            label="Point time color"
            value={settings.pointDateColor}
            defaultValue=""
            automatic={{ color: "#64748b", description: "Uses the theme secondary text color." }}
            onChange={(pointDateColor) => onChange({ pointDateColor })}
          />
        )}
      </fieldset>
    </section>
  );
}

export function TimelineIntervalTextSettings({ settings, onChange }: TimelineTextSettingsProps) {
  const horizontal = settings.orientation === "horizontal";
  return (
    <section className="settings-section timeline-settings-section timeline-interval-text-settings">
      <h3>Interval text</h3>
      <fieldset className="timeline-style-group">
        <legend>Title</legend>
        <div className="timeline-control-row">
          <span>Placement</span>
          <TimelineChoices
            label="Interval title placement"
            value={settings.intervalTitle}
            options={[
              { value: "outside", label: "Outside" },
              { value: "inside", label: "Inside" },
              { value: "hidden", label: "Hidden" },
            ]}
            onChange={(intervalTitle) => onChange({ intervalTitle })}
          />
        </div>
        {settings.intervalTitle === "inside" && (
          <div className="timeline-control-row">
            <span>Alignment</span>
            <TimelineChoices
              label="Interval title alignment"
              value={settings.intervalAlign}
              options={(["start", "center", "end"] as const).map((value, i) => ({
                value,
                label: (horizontal ? ["Left", "Center", "Right"] : ["Top", "Center", "Bottom"])[i],
                icon: <TimelineAlignmentIcon align={value} horizontal={horizontal} />,
              }))}
              onChange={(intervalAlign) => onChange({ intervalAlign })}
            />
          </div>
        )}
        {settings.intervalTitle !== "hidden" && (
          <>
            <div className="timeline-control-row">
              <span>Font color</span>
              <TimelineChoices
                label="Interval title color source"
                value={settings.intervalTextColorMode}
                options={[
                  { value: "event", label: "Match interval" },
                  { value: "theme", label: "Theme" },
                  { value: "custom", label: "Custom" },
                ]}
                onChange={(intervalTextColorMode) => onChange({ intervalTextColorMode })}
              />
            </div>
            {settings.intervalTextColorMode === "event" && (
              <p className="timeline-style-hint">Automatically follows the interval's Type or Track color.</p>
            )}
            {settings.intervalTextColorMode === "custom" && (
              <ColorSetting
                label="Font color"
                value={settings.intervalTextColor || "#18212f"}
                defaultValue="#18212f"
                onChange={(intervalTextColor) => onChange({ intervalTextColor })}
              />
            )}
          </>
        )}
      </fieldset>
    </section>
  );
}
