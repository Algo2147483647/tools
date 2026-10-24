import Icon from "../ui/Icon";
import NumericSetting, { ResetSetting } from "./NumericSetting";
import ColorSetting from "./ColorSetting";
import { SchemaValueEditor } from "./AppearanceSchema";
import { useAppearanceUI, type AppearanceRendererProps } from "./AppearanceUIContext";
import { GRAPH_TITLE_FONT_OPTIONS } from "../../graph/types";
import type { TimelineViewSettings } from "../../graph/timelineSettings";
import TimelinePointSettings, { TimelineMarkerEditor } from "../TimelinePointSettings";
import TimelineColorSettings from "../TimelineColorSettings";
import TimelineIntervalSettings from "../TimelineIntervalSettings";
import { TimelinePointTextSettings, TimelineIntervalTextSettings } from "../TimelineTextSettings";
import TimelineControls from "../TimelineControls";

function NumberControl({ node, binding }: AppearanceRendererProps) {
  const { commit, model } = useAppearanceUI();
  if (!binding) return null;
  const pixels = binding.definition.format === "pixels";
  const scale = node.options?.scale ?? 1;
  const label =
    node.labelBy?.values[String(node.labelBy && model.bind(node.labelBy.path).value)] ??
    node.label ??
    binding.definition.label ??
    node.id;
  return (
    <NumericSetting
      label={label}
      value={(pixels ? parseFloat(String(binding.value)) : Number(binding.value)) * scale}
      defaultValue={(pixels ? parseFloat(String(binding.defaultValue)) : Number(binding.defaultValue)) * scale}
      min={binding.definition.min !== undefined ? binding.definition.min * scale : (node.options?.min ?? 0)}
      max={binding.definition.max !== undefined ? binding.definition.max * scale : (node.options?.max ?? 100)}
      step={node.options?.step ?? binding.definition.step ?? 1}
      unit={node.options?.unit ?? binding.definition.unit ?? "px"}
      onChange={(value) => commit(() => binding.set(pixels ? `${value / scale}px` : value / scale))}
    />
  );
}
function ColorControl({ node, binding }: AppearanceRendererProps) {
  const { commit } = useAppearanceUI();
  if (!binding) return null;
  return (
    <ColorSetting
      label={node.label ?? binding.definition.label ?? node.id}
      value={String(binding.value)}
      defaultValue={String(binding.defaultValue)}
      onChange={(value) => commit(() => binding.set(value))}
      {...(binding.defaultValue === ""
        ? { automatic: { color: "#64748b", description: "Uses the chart color." } }
        : {})}
    />
  );
}
function ToggleControl({ node, binding }: AppearanceRendererProps) {
  const { commit } = useAppearanceUI();
  if (!binding) return null;
  const label = node.label ?? binding.definition.label ?? node.id;
  const checked = node.options?.invert ? !binding.value : Boolean(binding.value);
  const changed = binding.value !== binding.defaultValue;
  return (
    <div className="setting-toggle">
      <label className="settings-toggle-row">
        <span>
          {label}
          {changed && <span className="setting-modified" aria-label="Modified from default" />}
        </span>
        <input
          type="checkbox"
          role="switch"
          aria-label={label}
          checked={checked}
          onChange={() => commit(() => binding.set(!binding.value))}
        />
      </label>
      <ResetSetting label={label} changed={changed} onReset={() => commit(binding.reset)} />
    </div>
  );
}
function TupleControl({ node, binding }: AppearanceRendererProps) {
  const { commit } = useAppearanceUI();
  if (!binding) return null;
  const values = binding.value as number[],
    defaults = binding.defaultValue as number[];
  return (
    <fieldset className="appearance-tuple-control">
      <legend>{node.label ?? binding.definition.label ?? node.id}</legend>
      {values.map((value, index) => (
        <NumericSetting
          key={index}
          label={node.options?.labels?.[index] ?? `${node.id} ${index + 1}`}
          value={value}
          defaultValue={defaults[index]}
          min={binding.definition.items?.min ?? 0}
          max={binding.definition.items?.max ?? node.options?.max ?? 1000}
          step={node.options?.step ?? 1}
          unit={node.options?.unit ?? "px"}
          onChange={(next) => commit(() => binding.set(values.map((v, i) => (i === index ? next : v))))}
        />
      ))}
    </fieldset>
  );
}
function FieldControl({ node, binding }: AppearanceRendererProps) {
  const { commit } = useAppearanceUI();
  if (!binding) return null;
  return (
    <div className="font-setting">
      <label>{node.label ?? binding.definition.label ?? node.id}</label>
      <SchemaValueEditor
        key={`${binding.path}:${JSON.stringify(binding.value)}`}
        path={binding.path}
        value={binding.value}
        options={binding.definition.enum?.map(String)}
        onCommit={(value) => {
          const next = binding.set(value);
          commit(() => next);
          return value;
        }}
      />
    </div>
  );
}
function FontControl({ node, binding }: AppearanceRendererProps) {
  const { commit } = useAppearanceUI();
  if (!binding) return null;
  const label = node.label ?? "Font";
  return (
    <div className="font-setting">
      <div className="setting-label-row">
        <label htmlFor={`setting-${node.id}`}>{label}</label>
        <ResetSetting
          label={label}
          changed={binding.value !== binding.defaultValue}
          onReset={() => commit(binding.reset)}
        />
      </div>
      <select
        id={`setting-${node.id}`}
        value={String(binding.value)}
        onChange={(e) => commit(() => binding.set(e.target.value))}
      >
        {!GRAPH_TITLE_FONT_OPTIONS.some((f) => f.value === binding.value) && (
          <option value={String(binding.value)}>{String(binding.value)}</option>
        )}
        {GRAPH_TITLE_FONT_OPTIONS.map((f) => (
          <option key={f.label} value={f.value}>
            {f.label}
          </option>
        ))}
      </select>
    </div>
  );
}
function TitleFormatControl() {
  const { model, commit } = useAppearanceUI();
  const align = model.bind("style.appearance.display.titleAlign"),
    overflow = model.bind("style.appearance.display.titleOverflow");
  const weight = model.bind("style.appearance.cssVars[--dag-title-font-weight]"),
    italic = model.bind("style.appearance.cssVars[--dag-title-font-style]");
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
      <div className="title-format-row">
        <span>Style</span>
        <div className="title-format-segments" role="group" aria-label="Title style">
          <button
            type="button"
            title="Bold"
            aria-label="Bold title"
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
            aria-label="Italic title"
            aria-pressed={italic.value === "italic"}
            onClick={() => commit(() => italic.set(italic.value === "italic" ? "normal" : "italic"))}
          >
            <Icon name="italic" size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}
function useTimelineBinding() {
  const { model, commit } = useAppearanceUI();
  return {
    settings: model.bind("style.timeline").value as TimelineViewSettings,
    onChange: (patch: Partial<TimelineViewSettings>) =>
      commit(() =>
        model.change(Object.entries(patch).map(([key, value]) => ({ path: `style.timeline.${key}`, value }))),
      ),
  };
}
export const APPEARANCE_RENDERERS = {
  panel: ({ children }: AppearanceRendererProps) => <>{children}</>,
  grid: ({ children }: AppearanceRendererProps) => <div className="settings-slider-grid">{children}</div>,
  number: NumberControl,
  color: ColorControl,
  toggle: ToggleControl,
  tuple: TupleControl,
  field: FieldControl,
  font: FontControl,
  "title-format": TitleFormatControl,
  "timeline-layout": function Layout() {
    const { timelineControls } = useAppearanceUI();
    const binding = useTimelineBinding();
    return timelineControls ? <TimelineControls {...timelineControls} {...binding} /> : null;
  },
  "timeline-colors": function Colors() {
    return <TimelineColorSettings {...useTimelineBinding()} />;
  },
  "timeline-points": function Points({ children }: AppearanceRendererProps) {
    return <TimelinePointSettings {...useTimelineBinding()} markerUI={children} />;
  },
  "timeline-anchors": function Anchors({ children }: AppearanceRendererProps) {
    return <TimelinePointSettings {...useTimelineBinding()} anchors markerUI={children} />;
  },
  "timeline-marker": function Marker({ binding }: AppearanceRendererProps) {
    return <TimelineMarkerEditor {...useTimelineBinding()} anchors={binding?.path.endsWith("anchorMarker")} />;
  },
  "timeline-intervals": function Intervals() {
    return <TimelineIntervalSettings {...useTimelineBinding()} />;
  },
  "timeline-point-text": function PointText() {
    return <TimelinePointTextSettings {...useTimelineBinding()} />;
  },
  "timeline-interval-text": function IntervalText() {
    return <TimelineIntervalTextSettings {...useTimelineBinding()} />;
  },
};
