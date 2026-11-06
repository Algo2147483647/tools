import { useId } from "react";
import { useAppearanceUI } from "./AppearanceUIContext";
import NumericSetting, { ResetSetting } from "./NumericSetting";

export default function NodeSizeControl() {
  const id = useId();
  const { model, commit } = useAppearanceUI();
  const widths = model.bind("style.appearance.nodes.widths");
  const mode = model.bind("style.alignNodeWidthsToMax");
  const height = model.bind("style.appearance.nodes.height");
  const [min, max] = widths.value as number[];
  const [defaultMin, defaultMax] = widths.defaultValue as number[];
  const fixed = mode.supported && Boolean(mode.value);
  return (
    <div className="node-size-control">
      {mode.supported && (
        <div className="node-size-mode">
          <div className="setting-label-row">
            <label htmlFor={id}>Width mode</label>
            <ResetSetting
              label="Width mode"
              changed={mode.value !== mode.defaultValue}
              onReset={() => commit(mode.reset)}
            />
          </div>
          <select
            id={id}
            value={fixed ? "fixed" : "content"}
            onChange={(event) => commit(() => mode.set(event.target.value === "fixed"))}
          >
            <option value="fixed">Fixed</option>
            <option value="content">Fit content</option>
          </select>
        </div>
      )}
      <div className="node-size-width">
        {!fixed && (
          <NumericSetting
            label="Minimum width"
            value={min}
            defaultValue={defaultMin}
            onChange={(value) => commit(() => widths.set([value, max]))}
          />
        )}
        {!fixed && (
          <span className="node-size-separator" aria-hidden="true">
            –
          </span>
        )}
        <NumericSetting
          label={fixed ? "Width" : "Maximum width"}
          value={max}
          defaultValue={defaultMax}
          onChange={(value) => commit(() => widths.set([fixed ? Math.min(min, value) : min, value]))}
        />
      </div>
      {height.supported && (
        <NumericSetting
          label="Height"
          value={Number(height.value)}
          defaultValue={Number(height.defaultValue)}
          onChange={(value) => commit(() => height.set(value))}
        />
      )}
    </div>
  );
}
