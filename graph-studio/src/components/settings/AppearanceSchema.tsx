import { useId, useRef, useState } from "react";
import { getGraphChartLabel, type GraphChartType } from "../../graph/types";
import { getGraphAppearancePresets, type GraphAppearancePresetId } from "../../schema/appearance/commands";
import { getAppearanceSchema } from "../../schema/appearance/schema";
import { chartStylesEqual, type ChartStyle } from "../../schema/appearance/styles";
import { updateAppearanceSchemaValue } from "../../schema/styleProtocol";
import ProtocolSchema from "./ProtocolSchema";

export default function AppearanceSchema({
  chartType,
  style,
  onChange,
  onPresetChange,
}: {
  chartType: GraphChartType;
  style: ChartStyle;
  onChange: (style: ChartStyle) => void;
  onPresetChange: (id: GraphAppearancePresetId) => void;
}) {
  const schema = getAppearanceSchema(chartType, style);
  const presets = getGraphAppearancePresets(chartType);
  const selected = presets.find((preset) => chartStylesEqual(preset.document.style, style));
  return (
    <div className="appearance-schema-view">
      <label className="schema-preset-picker">
        Preset
        <select
          aria-label="Schema preset"
          value={selected?.id ?? "custom"}
          onChange={(event) => onPresetChange(event.target.value as GraphAppearancePresetId)}
        >
          <option value="custom" disabled>
            Custom
          </option>
          {presets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <ProtocolSchema
        label={`${getGraphChartLabel(chartType)} appearance`}
        version="graph-studio-style · v1 / GraphAppearance · v1"
        fields={schema.fields}
        example={schema.example}
        fileName={`${chartType}.style.json`}
        valueHeading="Current value"
        renderValue={(field) => {
          const entry = schema.entries.get(field.path);
          if (!entry?.editable)
            return <code>{entry && typeof entry.value !== "object" ? JSON.stringify(entry.value) : "—"}</code>;
          return (
            <SchemaValueEditor
              key={`${field.path}:${JSON.stringify(entry.value)}`}
              path={field.path}
              value={entry.value}
              options={field.definition?.enum?.map(String)}
              onCommit={(value) => {
                const next = updateAppearanceSchemaValue(chartType, style, field.path, value);
                onChange(next);
                return getAppearanceSchema(chartType, next).entries.get(field.path)?.value;
              }}
            />
          );
        }}
      />
    </div>
  );
}

export function SchemaValueEditor({
  path,
  value,
  options,
  onCommit,
}: {
  path: string;
  value: unknown;
  options?: string[];
  onCommit: (value: unknown) => unknown;
}) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  const [draft, setDraft] = useState(source);
  const [error, setError] = useState("");
  const errorId = useId();
  const dialog = useRef<HTMLDialogElement>(null);
  const commit = () => {
    if (draft === source) {
      setError("");
      return;
    }
    try {
      const parsed = typeof value === "string" ? draft : JSON.parse(draft);
      const saved = onCommit(parsed);
      setDraft(typeof saved === "string" ? saved : JSON.stringify(saved));
      setError("");
      dialog.current?.close();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Invalid value.");
    }
  };
  if (path === "style.appearance.css")
    return (
      <>
        <button type="button" className="schema-edit-code" onClick={() => dialog.current?.showModal()}>
          Edit CSS…
        </button>
        <dialog
          ref={dialog}
          className="schema-code-dialog"
          aria-label="Edit appearance CSS"
          onKeyDown={(event) => event.stopPropagation()}
          onCancel={() => {
            setDraft(source);
            setError("");
          }}
        >
          <h3>Edit CSS</h3>
          <textarea
            aria-label="Appearance schema CSS"
            value={draft}
            spellCheck={false}
            onChange={(event) => setDraft(event.target.value)}
          />
          {error && <p role="alert">{error}</p>}
          <div className="schema-code-dialog-actions">
            <button
              type="button"
              onClick={() => {
                setDraft(source);
                setError("");
                dialog.current?.close();
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                if (draft === source) dialog.current?.close();
                else commit();
              }}
            >
              Apply
            </button>
          </div>
        </dialog>
      </>
    );
  if (typeof value === "boolean")
    return (
      <button
        type="button"
        role="switch"
        className="schema-value-switch"
        aria-label={path}
        aria-checked={value}
        onClick={() => onCommit(!value)}
      />
    );
  if (options)
    return (
      <select
        className="schema-value-input"
        aria-label={path}
        value={String(value)}
        onChange={(event) => onCommit(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    );
  return (
    <div className="schema-value-editor">
      <input
        className="schema-value-input"
        aria-label={path}
        value={draft}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        onChange={(event) => {
          setDraft(event.target.value);
          setError("");
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            commit();
          }
          if (event.key === "Escape") {
            event.preventDefault();
            event.stopPropagation();
            setDraft(source);
            setError("");
          }
        }}
      />
      {error && (
        <span id={errorId} role="alert" className="schema-value-error">
          {error}
        </span>
      )}
    </div>
  );
}
