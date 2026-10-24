import { useId, useRef, type ReactNode } from "react";

export default function MethodTabs<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  children,
}: {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  disabled?: boolean;
  children: ReactNode;
}) {
  const id = useId();
  const list = useRef<HTMLDivElement>(null);
  return (
    <div className="method-tabs">
      <div ref={list} className="method-tabs-list" role="tablist" aria-label={label}>
        {options.map((option, index) => (
          <button
            key={option.value}
            type="button"
            role="tab"
            id={id + "-" + option.value}
            aria-selected={value === option.value}
            aria-controls={id + "-panel"}
            tabIndex={value === option.value ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => {
              const next =
                event.key === "ArrowRight"
                  ? (index + 1) % options.length
                  : event.key === "ArrowLeft"
                    ? (index + options.length - 1) % options.length
                    : event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? options.length - 1
                        : -1;
              if (next < 0) return;
              event.preventDefault();
              onChange(options[next].value);
              list.current?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
            }}
          >
            {option.label}
          </button>
        ))}
      </div>
      <div
        id={id + "-panel"}
        role="tabpanel"
        aria-labelledby={id + "-" + value}
        tabIndex={0}
        className="method-tabs-content"
      >
        {children}
      </div>
    </div>
  );
}
