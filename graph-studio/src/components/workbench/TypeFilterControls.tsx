import { useState } from "react";
import type { TypeFilter } from "../../graph/typeFilter";

export default function TypeFilterControls({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: TypeFilter;
  onChange(value: TypeFilter): void;
}) {
  const [query, setQuery] = useState("");
  const shown = options.filter((type) => type.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return (
    <section className="workbench-card type-filter" aria-label="Type filter">
      <div className="workbench-section-heading">
        <h3>Types</h3>
        <button className="workbench-text-button" onClick={() => onChange({ ...value, enabled: false, values: [] })}>
          Show all types
        </button>
      </div>
      <div className="type-filter-modes">
        <div className="type-filter-selection" role="group" aria-label="Type selection">
          {(["single", "multiple"] as const).map((selection) => (
            <button
              key={selection}
              aria-pressed={value.selection === selection}
              onClick={() =>
                onChange({
                  ...value,
                  selection,
                  values: selection === "single" ? value.values.slice(0, 1) : value.values,
                })
              }
            >
              {selection === "single" ? "Single" : "Multiple"}
            </button>
          ))}
        </div>
        <div className="type-filter-operation" role="group" aria-label="Type filter operation">
          {(["include", "exclude"] as const).map((operation) => (
            <button
              key={operation}
              aria-label={operation === "include" ? "Include selected" : "Exclude selected"}
              title={operation === "include" ? "Show selected types" : "Hide selected types"}
              aria-pressed={value.operation === operation}
              onClick={() => onChange({ ...value, operation })}
            >
              {operation === "include" ? "Include" : "Exclude"}
            </button>
          ))}
        </div>
      </div>
      <input
        className="studio-field"
        type="search"
        aria-label="Find types"
        placeholder="Find a type…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <div className="type-filter-options" role="group" aria-label="Available types">
        {shown.map((type) => (
          <label key={type}>
            <input
              type={value.selection === "single" ? "radio" : "checkbox"}
              name="workbench-types"
              checked={value.enabled && value.values.includes(type)}
              onChange={() =>
                onChange({
                  ...value,
                  enabled: true,
                  values:
                    value.selection === "single"
                      ? [type]
                      : value.values.includes(type)
                        ? value.values.filter((t) => t !== type)
                        : [...value.values, type],
                })
              }
            />
            <span>{type}</span>
          </label>
        ))}
        {!shown.length && (
          <p className="workbench-hint">{options.length ? "No matching types." : "This graph has no types."}</p>
        )}
      </div>
      {value.selection === "multiple" && options.length > 0 && (
        <div className="workbench-actions">
          <button onClick={() => onChange({ ...value, enabled: true, values: options })}>Select all</button>
          <button onClick={() => onChange({ ...value, enabled: true, values: [] })}>Clear selection</button>
          <button
            onClick={() =>
              onChange({ ...value, enabled: true, values: options.filter((t) => !value.values.includes(t)) })
            }
          >
            Invert selection
          </button>
        </div>
      )}
      <p className="workbench-hint" role="status">
        {!value.enabled
          ? "All types visible."
          : value.operation === "include"
            ? `Showing ${value.values.length} selected type${value.values.length === 1 ? "" : "s"}.`
            : `Hiding ${value.values.length} selected type${value.values.length === 1 ? "" : "s"}. Untyped nodes remain visible.`}
      </p>
    </section>
  );
}
