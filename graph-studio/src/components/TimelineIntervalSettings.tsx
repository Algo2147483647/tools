import type { TimelineViewSettings } from "../graph/timeline/settings";
import { getDefaultChartStyle } from "../schema/chartStyles";
import ColorSetting from "./settings/ColorSetting";
import NumericSetting from "./settings/NumericSetting";
import { TimelineChoices } from "./TimelineSettingFields";

export default function TimelineIntervalSettings({
  settings,
  onChange,
}: {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
}) {
  const hasBorder =
    settings.intervalBorder === "solid" ||
    settings.intervalBorder === "dashed" ||
    (settings.intervalBorder === "auto" && settings.intervalStyle === "outline");
  return (
    <section className="settings-section timeline-settings-section timeline-interval-settings">
      <h3>Interval bars</h3>
      <p>Style duration events independently from point events.</p>
      <fieldset className="timeline-style-group">
        <legend>Shape &amp; fill</legend>
        <div className="timeline-control-row">
          <span>Fill</span>
          <TimelineChoices
            schemaPath="intervalStyle"
            label="Interval fill style"
            value={settings.intervalStyle}
            options={[
              { value: "soft", label: "Soft", icon: <i className="timeline-fill-swatch soft" /> },
              { value: "solid", label: "Solid", icon: <i className="timeline-fill-swatch solid" /> },
              { value: "outline", label: "Outline", icon: <i className="timeline-fill-swatch outline" /> },
            ]}
            onChange={(intervalStyle) => onChange({ intervalStyle })}
          />
        </div>
        <NumericSetting
          label="Thickness"
          value={settings.intervalWidth}
          defaultValue={timelineDefaults.intervalWidth}
          min={0}
          max={240}
          step={1}
          unit="px"
          onChange={(intervalWidth) => onChange({ intervalWidth })}
        />
        <NumericSetting
          label="Corner radius"
          value={settings.intervalRadius}
          defaultValue={timelineDefaults.intervalRadius}
          min={0}
          max={120}
          step={1}
          unit="px"
          onChange={(intervalRadius) => onChange({ intervalRadius })}
        />
      </fieldset>
      <fieldset className="timeline-style-group">
        <legend>Border</legend>
        <div className="timeline-control-row">
          <span>Style</span>
          <TimelineChoices
            schemaPath="intervalBorder"
            label="Interval border style"
            value={settings.intervalBorder}
            options={[
              { value: "auto", label: "Auto" },
              { value: "none", label: "None" },
              { value: "solid", label: "Solid", icon: <i className="timeline-border-swatch" /> },
              { value: "dashed", label: "Dashed", icon: <i className="timeline-border-swatch dashed" /> },
            ]}
            onChange={(intervalBorder) => onChange({ intervalBorder })}
          />
        </div>
        {settings.intervalBorder === "auto" && (
          <p className="timeline-style-hint">Follows the fill style: Outline adds a border.</p>
        )}
        {hasBorder && (
          <>
            <NumericSetting
              label="Stroke width"
              value={settings.intervalBorderWidth}
              defaultValue={timelineDefaults.intervalBorderWidth}
              min={0}
              max={20}
              step={0.5}
              unit="px"
              onChange={(intervalBorderWidth) => onChange({ intervalBorderWidth })}
            />
            <ColorSetting
              label="Border color"
              value={settings.intervalBorderColor}
              defaultValue={timelineDefaults.intervalBorderColor}
              automatic={{ color: "#64748b", description: "Uses the event color from Color by." }}
              onChange={(intervalBorderColor) => onChange({ intervalBorderColor })}
            />
          </>
        )}
      </fieldset>
    </section>
  );
}

const timelineDefaults = getDefaultChartStyle("timeline").timeline!;
