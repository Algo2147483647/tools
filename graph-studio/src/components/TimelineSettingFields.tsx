import { useEffect, useState, type ReactNode } from "react";

export function TimelineChoices<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string; icon?: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="timeline-choice" role="group" aria-label={label}>
      {options.map((option) => (
        <button
          type="button"
          key={option.value}
          aria-label={option.label}
          title={option.label}
          aria-pressed={value === option.value}
          onClick={() => onChange(option.value)}
        >
          {option.icon}
          <span>{option.label}</span>
        </button>
      ))}
    </div>
  );
}

export function TimelineNumberField({
  label,
  ariaLabel = label,
  value,
  unit,
  onChange,
}: {
  label: string;
  ariaLabel?: string;
  value: number;
  unit?: string;
  onChange: (value: number) => void;
}) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  function commit() {
    if (draft.trim() && Number.isFinite(Number(draft))) onChange(Number(draft));
    else setDraft(String(value));
  }
  return (
    <label className="timeline-field">
      <span>{label}</span>
      <div className="timeline-number-field">
        <input
          type="number"
          step="any"
          aria-label={ariaLabel}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
            if (event.key === "Escape") {
              setDraft(String(value));
              event.stopPropagation();
            }
          }}
        />
        {unit && <span>{unit}</span>}
      </div>
    </label>
  );
}

export function TimelineAlignmentIcon({
  align,
  horizontal,
}: {
  align: "start" | "center" | "end";
  horizontal: boolean;
}) {
  const position = align === "start" ? 4 : align === "end" ? 20 : 12;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <g transform={horizontal ? undefined : "rotate(90 12 12)"}>
        <path d={`M${position} 3v18`} />
        {[7, 12, 17].map((y, i) => {
          const width = i === 1 ? 6 : 10;
          const x = align === "start" ? 7 : align === "end" ? 17 - width : 12 - width / 2;
          return <path key={y} d={`M${x} ${y}h${width}`} />;
        })}
      </g>
    </svg>
  );
}
