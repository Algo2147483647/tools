import type { TimelineViewSettings } from "../../schema/appearance/types";
import { TimelineChoices } from "./TimelineSettingFields";

export default function TimelineColorSettings({
  settings,
  onChange,
}: {
  settings: TimelineViewSettings;
  onChange: (patch: Partial<TimelineViewSettings>) => void;
}) {
  return (
    <section className="settings-section timeline-settings-section timeline-color-settings">
      <h3>Event colors</h3>
      <div className="timeline-control-row">
        <span>Color by</span>
        <TimelineChoices
          schemaPath="colorBy"
          label="Timeline color by"
          value={settings.colorBy}
          options={[
            { value: "track", label: "Track" },
            { value: "type", label: "Type" },
          ]}
          onChange={(colorBy) => onChange({ colorBy })}
        />
      </div>
      <p>Colors apply to points, interval fills and automatic borders. Text colors remain independent.</p>
    </section>
  );
}
