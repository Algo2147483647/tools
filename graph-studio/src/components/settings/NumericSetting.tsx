import { useEffect, useId, useState } from "react";

export function ResetSetting({ label, changed, onReset }: { label: string; changed: boolean; onReset: () => void }) {
  return (
    <button
      type="button"
      className="setting-reset"
      aria-label={`Reset ${label}`}
      title="Restore default"
      disabled={!changed}
      onClick={onReset}
    >
      ↺
    </button>
  );
}

export default function NumericSetting({
  label,
  value,
  defaultValue,
  unit = "px",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  unit?: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const changed = value !== defaultValue;
  const commit = (raw: string) => {
    if (!raw.trim() || !Number.isFinite(Number(raw))) {
      setDraft(String(value));
      return;
    }
    const next = Number(raw);
    setDraft(String(next));
    if (next !== value) onChange(next);
  };
  return (
    <div className="numeric-setting" data-modified={changed} aria-disabled={disabled || undefined}>
      <div className="setting-label-row">
        <label htmlFor={id}>
          {label}
          {changed && <span className="setting-modified" aria-label="Modified from default" />}
        </label>
      </div>
      <div className="numeric-setting-inputs">
        <label className="numeric-setting-value">
          <input
            id={id}
            type="number"
            aria-label={`${label} value`}
            step="any"
            disabled={disabled}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={() => commit(draft)}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
              if (event.key === "Escape") {
                setDraft(String(value));
                event.stopPropagation();
              }
            }}
          />
          <span>{unit}</span>
        </label>
      </div>
      <ResetSetting label={label} changed={changed && !disabled} onReset={() => onChange(defaultValue)} />
    </div>
  );
}
