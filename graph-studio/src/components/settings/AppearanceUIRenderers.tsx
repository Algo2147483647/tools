import { Fragment, useId } from "react";
import AppearanceCssEditor from "./AppearanceCssEditor";
import NodeSizeControl from "./NodeSizeControl";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import { GRAPH_TITLE_FONT_OPTIONS } from "../../graph/types";
import TimelineColorSettings from "../timeline/TimelineColorSettings";
import TimelineControls from "../timeline/TimelineControls";
import TimelineIntervalSettings from "../timeline/TimelineIntervalSettings";
import TimelinePointSettings, { TimelineMarkerEditor } from "../timeline/TimelinePointSettings";
import { TimelineIntervalTextSettings, TimelinePointTextSettings } from "../timeline/TimelineTextSettings";
import TitleFormatControl from "./TitleFormatControl";
import FontSizeStyleControl from "./FontSizeStyleControl";
import { SchemaValueEditor } from "./AppearanceSchema";
import { useAppearanceUI, type AppearanceRendererProps } from "./AppearanceUIContext";
import ColorSetting from "./ColorSetting";
import NumericSetting, { NumericInput, ResetSetting } from "./NumericSetting";

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
  const id = useId();
  if (!binding) return null;
  const values = binding.value as number[],
    defaults = binding.defaultValue as number[];
  const label = node.label ?? binding.definition.label ?? node.id;
  const changed = values.some((value, index) => value !== defaults[index]);
  return (
    <div className="numeric-setting" data-modified={changed}>
      <div className="setting-label-row">
        <label htmlFor={id}>
          {label}
          {changed && <span className="setting-modified" aria-label="Modified from default" />}
        </label>
      </div>
      <div className="numeric-setting-inputs numeric-setting-inputs--tuple">
        {values.map((value, index) => (
          <Fragment key={index}>
            {index > 0 && <span aria-hidden="true">,</span>}
            <NumericInput
              id={index === 0 ? id : undefined}
              label={node.options?.labels?.[index] ?? `${node.id} ${index + 1}`}
              value={value}
              unit={node.options?.unit ?? "px"}
              onChange={(next) => commit(() => binding.set(values.map((v, i) => (i === index ? next : v))))}
            />
          </Fragment>
        ))}
      </div>
      <ResetSetting label={label} changed={changed} onReset={() => commit(binding.reset)} />
    </div>
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
  "node-size": NodeSizeControl,
  css: ({ node }: AppearanceRendererProps) => (
    <AppearanceCssEditor label={node.label} placeholder={node.options?.placeholder} />
  ),
  section: ({ node, children }: AppearanceRendererProps) => (
    <section className="appearance-text-section" data-section={node.id}>
      {node.label && <h3>{node.label}</h3>}
      <div className="settings-field-grid">{children}</div>
    </section>
  ),
  panel: ({ children }: AppearanceRendererProps) => <>{children}</>,
  number: NumberControl,
  color: ColorControl,
  toggle: ToggleControl,
  tuple: TupleControl,
  field: FieldControl,
  font: FontControl,
  "title-format": TitleFormatControl,
  "font-size-style": FontSizeStyleControl,
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
