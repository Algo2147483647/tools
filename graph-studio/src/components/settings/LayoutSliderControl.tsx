import { DEFAULT_GRAPH_APPEARANCE } from "../../graph/appearance";
import type { LayoutControlDefinition } from "./settingsConfig";
import NumericSetting from "./NumericSetting";

export default function LayoutSliderControl({
  control,
  value,
  defaultValue,
  onChange,
}: {
  control: LayoutControlDefinition;
  value: number;
  defaultValue?: number;
  onChange: (value: number) => void;
}) {
  const { key, ...definition } = control;
  return (
    <NumericSetting
      {...definition}
      value={value}
      defaultValue={defaultValue ?? DEFAULT_GRAPH_APPEARANCE.layout[key]}
      onChange={(value) => onChange(Math.round(value))}
    />
  );
}
