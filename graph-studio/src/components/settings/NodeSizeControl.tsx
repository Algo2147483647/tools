import { useAppearanceUI } from "./AppearanceUIContext";
import NumericSetting, { ResetSetting } from "./NumericSetting";

export default function NodeSizeControl() {
  const { model, commit } = useAppearanceUI();
  const widths = model.bind("style.appearance.nodes.widths");
  const mode = model.bind("style.alignNodeWidthsToMax");
  const height = model.bind("style.appearance.nodes.height");
  const [min, max] = widths.value as number[];
  const [defaultMin, defaultMax] = widths.defaultValue as number[];
  const fixed = mode.supported && Boolean(mode.value);
  return (
    <div className="node-size-control" data-width-mode={fixed ? "fixed" : "content"}>
      {mode.supported && (
        <div className="node-size-mode setting-toggle">
          <label className="settings-toggle-row">
            <span>Fixed width</span>
            <input
              type="checkbox"
              role="switch"
              aria-label="Fixed width"
              checked={fixed}
              onChange={() => commit(() => mode.set(!fixed))}
            />
          </label>
          <ResetSetting
            label="Fixed width"
            changed={mode.value !== mode.defaultValue}
            onReset={() => commit(mode.reset)}
          />
        </div>
      )}
      <div className={fixed ? "node-size-width" : "node-width-range"}>
        {!fixed && <span className="node-width-range-label">Width</span>}
        <div className={fixed ? "node-size-width" : "node-width-range-inputs"} role="group" aria-label="Width">
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
              ~
            </span>
          )}
          <NumericSetting
            label={fixed ? "Width" : "Maximum width"}
            value={max}
            defaultValue={defaultMax}
            onChange={(value) => commit(() => widths.set([fixed ? Math.min(min, value) : min, value]))}
          />
        </div>
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
