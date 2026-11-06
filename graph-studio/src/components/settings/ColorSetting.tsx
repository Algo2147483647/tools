import { useEffect, useId, useState } from "react";
import { ResetSetting } from "./NumericSetting";
import { formatColorValue, parseColorValue } from "./colorValue";

export default function ColorSetting({
  label,
  value,
  defaultValue,
  automatic,
  onChange,
}: {
  label: string;
  value: string;
  defaultValue: string;
  automatic?: { color: string; description: string };
  onChange: (value: string) => void;
}) {
  const id = useId();
  const parsed = parseColorValue(value);
  const hex = parsed?.hex ?? value;
  const opacity = parsed?.alpha ?? 1;
  const [draft, setDraft] = useState(hex);
  const [error, setError] = useState("");
  const [alpha, setAlpha] = useState(String(opacity * 100));
  useEffect(() => {
    setDraft(hex);
    setAlpha(String(opacity * 100));
    setError("");
  }, [hex, opacity]);
  const commitHex = (next: string) => {
    setError("");
    setDraft(next);
    onChange(formatColorValue({ hex: next, alpha: opacity }));
  };
  const commit = () => {
    const next = parseColorValue(draft);
    if (!next) {
      setError("Enter a HEX or RGB(A) color.");
      return;
    }
    commitHex(next.hex);
  };
  return (
    <div className="color-setting" data-modified={value !== defaultValue}>
      <div className="setting-label-row">
        <label htmlFor={automatic && !value ? `${id}-mode` : id}>
          {label}
          {value !== defaultValue && <span className="setting-modified" aria-label="Modified from default" />}
        </label>
        {automatic && (
          <select
            id={`${id}-mode`}
            className="color-setting-mode"
            aria-label={`${label} mode`}
            value={value ? "custom" : "auto"}
            onChange={(event) => onChange(event.target.value === "auto" ? "" : automatic.color)}
          >
            <option value="auto">Automatic</option>
            <option value="custom">Custom</option>
          </select>
        )}
      </div>
      {automatic && !value ? (
        <p className="color-setting-auto-hint">{automatic.description}</p>
      ) : (
        <>
          <div className="color-setting-inputs">
            <label className="color-picker" title={`Choose ${label}`} style={{ background: value }}>
              <input
                type="color"
                aria-label={`Choose ${label}`}
                value={parsed?.hex ?? "#000000"}
                onChange={(event) => commitHex(event.target.value)}
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
                  setDraft(hex);
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
                    setAlpha(String(opacity * 100));
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
        </>
      )}
      {error && (
        <p id={`${id}-error`} className="setting-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
