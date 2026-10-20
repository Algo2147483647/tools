import type { TimelineViewSettings } from "../graph/timelineSettings";
import ColorSetting from "./settings/ColorSetting";
import NumericSetting from "./settings/NumericSetting";
import { TimelineAlignmentIcon, TimelineChoices } from "./TimelineSettingFields";

export default function TimelineIntervalSettings({
  settings,
  onChange,
}: {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
}) {
  const horizontal = settings.orientation === "horizontal";
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
          defaultValue={36}
          min={0}
          max={240}
          step={1}
          unit="px"
          onChange={(intervalWidth) => onChange({ intervalWidth })}
        />
        <NumericSetting
          label="Corner radius"
          value={settings.intervalRadius}
          defaultValue={6}
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
              defaultValue={1.5}
              min={0}
              max={20}
              step={0.5}
              unit="px"
              onChange={(intervalBorderWidth) => onChange({ intervalBorderWidth })}
            />
            <ColorSetting
              label="Border color"
              value={settings.intervalBorderColor}
              defaultValue=""
              automatic={{ color: "#64748b", description: "Uses the event color from Color by." }}
              onChange={(intervalBorderColor) => onChange({ intervalBorderColor })}
            />
          </>
        )}
      </fieldset>
      <fieldset className="timeline-style-group">
        <legend>Text</legend>
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
