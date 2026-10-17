import { useEffect, useId, useState } from "react";
import { ResetSetting } from "./NumericSetting";
import { formatColorValue, parseColorValue } from "./colorValue";

export default function ColorSetting({
  label,
  value,
  defaultValue,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  onChange: (value: string) => void;
}) {
  const id = useId(),
    [draft, setDraft] = useState(value),
    [error, setError] = useState("");
  const parsed = parseColorValue(value);
  const [alpha, setAlpha] = useState(String((parsed?.alpha ?? 1) * 100));
  useEffect(() => {
    setDraft(value);
    setAlpha(String((parseColorValue(value)?.alpha ?? 1) * 100));
    setError("");
  }, [value]);
  const commit = () => {
    const next = parseColorValue(draft);
    if (!next) {
      setError("Enter a HEX or RGB(A) color.");
      return;
    }
    setError("");
    onChange(formatColorValue(next));
  };
  return (
    <div className="color-setting" data-modified={value !== defaultValue}>
      <div className="setting-label-row">
        <label htmlFor={id}>
          {label}
          {value !== defaultValue && <span className="setting-modified" aria-label="Modified from default" />}
        </label>
      </div>
      <div className="color-setting-inputs">
        <label className="color-picker" title={`Choose ${label}`} style={{ background: value }}>
          <input
            type="color"
            aria-label={`Choose ${label}`}
            value={parsed?.hex ?? "#000000"}
            onChange={(event) => {
              setError("");
              onChange(formatColorValue({ hex: event.target.value, alpha: parsed?.alpha ?? 1 }));
            }}
          />
        </label>
        <input
          id={id}
          aria-label={label}
          className="color-code"
          value={draft}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(value);
              setError("");
              event.stopPropagation();
            }
          }}
        />
        <label className="color-alpha">
          <input
            type="number"
            aria-label={`${label} opacity`}
            step="any"
            value={alpha}
            onChange={(event) => setAlpha(event.target.value)}
            onBlur={() => {
              if (!alpha.trim() || !Number.isFinite(Number(alpha))) {
                setAlpha(String((parsed?.alpha ?? 1) * 100));
                return;
              }
              const next = Number(alpha);
              setAlpha(String(next));
              onChange(formatColorValue({ hex: parsed?.hex ?? "#000000", alpha: next / 100 }));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span>%</span>
        </label>
      </div>
      <ResetSetting label={label} changed={value !== defaultValue} onReset={() => onChange(defaultValue)} />
      {error && (
        <p id={`${id}-error`} className="setting-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
