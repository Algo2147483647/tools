import Icon from "../ui/Icon";
import { useAppearanceUI } from "./AppearanceUIContext";
import { ResetSetting } from "./NumericSetting";

export default function TitleFormatControl() {
  const { model, commit } = useAppearanceUI();
  const align = model.bind("style.appearance.display.titleAlign"),
    overflow = model.bind("style.appearance.display.titleOverflow");
  return (
    <div className="title-format-controls" role="group" aria-label="Title formatting">
      {align.supported && (
        <div className="title-format-row">
          <span>Alignment</span>
          <div className="title-format-segments" role="group" aria-label="Title alignment">
            {align.definition.enum!.map((value) => (
              <button
                key={String(value)}
                type="button"
                title={`Align ${value}`}
                aria-label={`Align title ${value}`}
                aria-pressed={align.value === value}
                onClick={() => commit(() => align.set(value))}
              >
                <Icon name={value === "left" ? "align-left" : "align-center"} size={18} />
              </button>
            ))}
          </div>
          <ResetSetting
            label="Title alignment"
            changed={align.value !== align.defaultValue}
            onReset={() => commit(align.reset)}
          />
        </div>
      )}
      {overflow.supported && (
        <div className="title-format-row">
          <span>Overflow</span>
          <div className="title-format-segments" role="group" aria-label="Title overflow">
            {overflow.definition.enum!.map((value) => (
              <button
                key={String(value)}
                type="button"
                aria-label={value === "ellipsis" ? "Ellipsis" : value === "clip" ? "Clip text" : "Show full title"}
                aria-pressed={overflow.value === value}
                onClick={() => commit(() => overflow.set(value))}
              >
                <Icon
                  name={value === "ellipsis" ? "text-ellipsis" : value === "clip" ? "text-clip" : "text-overflow"}
                  size={18}
                />
              </button>
            ))}
          </div>
          <ResetSetting
            label="Title overflow"
            changed={overflow.value !== overflow.defaultValue}
            onReset={() => commit(overflow.reset)}
          />
        </div>
      )}
    </div>
  );
}
