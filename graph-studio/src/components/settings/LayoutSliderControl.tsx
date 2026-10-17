import type { LayoutControlDefinition } from "./settingsConfig";
import { useEffect, useState } from "react";

interface LayoutSliderControlProps {
  control: LayoutControlDefinition;
  value: number;
  onChange: (value: number) => void;
}

export default function LayoutSliderControl({ control, value, onChange }: LayoutSliderControlProps) {
  const inputId = `layout-control-${control.key}`;
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);

  const commitValue = (nextValue: number) => {
    if (!Number.isFinite(nextValue)) {
      setDraft(String(value));
      return;
    }
    const bounded = Math.max(control.min, Math.min(control.max, Math.round(nextValue)));
    setDraft(String(bounded));
    onChange(bounded);
  };

  return (
    <div className="layout-slider-control">
      <label htmlFor={inputId} className="layout-slider-label">
        {control.label}
      </label>
      <div className="layout-slider-inputs">
        <input
          id={inputId}
          className="layout-slider"
          type="range"
          min={control.min}
          max={control.max}
          step={control.step}
          value={value}
          onChange={(event) => commitValue(Number(event.currentTarget.value))}
        />
        <label className="layout-value-pill" htmlFor={`${inputId}-number`}>
          <input
            id={`${inputId}-number`}
            className="layout-value-input"
            type="number"
            min={control.min}
            max={control.max}
            step={control.step}
            value={draft}
            aria-label={`${control.label} value`}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onBlur={() => {
              if (draft.trim()) commitValue(Number(draft));
              else setDraft(String(value));
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") event.currentTarget.blur();
            }}
          />
          <span className="layout-value-unit">{control.unit || ""}</span>
        </label>
      </div>
    </div>
  );
}
