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
  min,
  max,
  step = 1,
  unit = "px",
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  defaultValue: number;
  min: number;
  max: number;
  step?: number;
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
    const bounded = Math.max(min, Math.min(max, Number(raw)));
    const rounded = Number(bounded.toFixed(4));
    setDraft(String(rounded));
    onChange(rounded);
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
        <input
          id={id}
          aria-label={label}
          type="range"
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          value={value}
          onChange={(event) => commit(event.currentTarget.value)}
        />
        <label className="numeric-setting-value">
          <input
            type="number"
            aria-label={`${label} value`}
            min={min}
            max={max}
            step={step}
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
