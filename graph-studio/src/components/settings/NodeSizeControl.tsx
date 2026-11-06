import { useAppearanceUI } from "./AppearanceUIContext";
import NumericSetting from "./NumericSetting";

export default function NodeSizeControl() {
  const { model, commit } = useAppearanceUI();
  const widths = model.bind("style.appearance.nodes.widths");
  const mode = model.bind("style.alignNodeWidthsToMax");
  const height = model.bind("style.appearance.nodes.height");
  const [min, max] = widths.value as number[];
  const [defaultMin, defaultMax] = widths.defaultValue as number[];
  const fixed = mode.supported && Boolean(mode.value);
  return (
    <>
      {mode.supported && (
        <div className="setting-toggle">
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
        </div>
      )}
      {fixed ? (
        <NumericSetting
          label="Width"
          value={max}
          defaultValue={defaultMax}
          onChange={(value) => commit(() => widths.set([Math.min(min, value), value]))}
        />
      ) : (
        <div className="node-width-range">
          <span className="node-width-range-label">Width</span>
          <div className="node-width-range-inputs" role="group" aria-label="Width">
            <NumericSetting
              label="Minimum width"
              value={min}
              defaultValue={defaultMin}
              onChange={(value) => commit(() => widths.set([value, max]))}
            />
            <span className="node-width-range-separator" aria-hidden="true">
              ~
            </span>
            <NumericSetting
              label="Maximum width"
              value={max}
              defaultValue={defaultMax}
              onChange={(value) => commit(() => widths.set([min, value]))}
            />
          </div>
        </div>
      )}
      {height.supported && (
        <NumericSetting
          label="Height"
          value={Number(height.value)}
          defaultValue={Number(height.defaultValue)}
          onChange={(value) => commit(() => height.set(value))}
        />
      )}
    </>
  );
}
