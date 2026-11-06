import Icon from "../ui/Icon";
import NumericSetting from "./NumericSetting";
import { useAppearanceUI, type AppearanceRendererProps } from "./AppearanceUIContext";

export default function FontSizeStyleControl({ node }: AppearanceRendererProps) {
  const { model, commit } = useAppearanceUI();
  const role = node.options?.fontRole ?? "title";
  const bind = (property: string) => model.bind(`style.appearance.cssVars[--dag-${role}-font-${property}]`);
  const size = bind("size"),
    weight = bind("weight"),
    style = bind("style");
  const label = node.label ?? "Style";
  return (
    <NumericSetting
      label={label}
      valueLabel={role === "title" ? "Title size" : "Description size"}
      value={parseFloat(String(size.value))}
      defaultValue={parseFloat(String(size.defaultValue))}
      onChange={(value) => commit(() => size.set(`${value}px`))}
      suffix={
        <div className="title-format-segments" role="group" aria-label={`${role} font style`}>
          <button
            type="button"
            title="Bold"
            aria-label={`Bold ${role}`}
            aria-pressed={weight.value === "700"}
            onClick={() =>
              commit(() =>
                weight.set(
                  weight.value === "700" ? (weight.defaultValue === "700" ? "400" : weight.defaultValue) : "700",
                ),
              )
            }
          >
            <Icon name="bold" size={18} />
          </button>
          <button
            type="button"
            title="Italic"
            aria-label={`Italic ${role}`}
            aria-pressed={style.value === "italic"}
            onClick={() => commit(() => style.set(style.value === "italic" ? "normal" : "italic"))}
          >
            <Icon name="italic" size={18} />
          </button>
        </div>
      }
    />
  );
}
