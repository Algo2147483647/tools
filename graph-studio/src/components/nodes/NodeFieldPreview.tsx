import type { RelativeLinkRoot } from "../../workspace/relativeLinks";
import MarkdownValue from "../content/MarkdownValue";
import { type EditableField, type FieldDisplayMode, supportsDisplayMode } from "./nodeFields";

export function FieldDisplayModeToggle({
  mode,
  onChange,
}: {
  mode: FieldDisplayMode;
  onChange: (mode: FieldDisplayMode) => void;
}) {
  const modes: Array<{ mode: FieldDisplayMode; label: string }> = [
    { mode: "markdown", label: "Markdown" },
    { mode: "text", label: "Text" },
  ];

  return (
    <div className="node-detail-display-toggle" role="group" aria-label="Field display mode">
      {modes.map((option) => (
        <button
          key={option.mode}
          className={`node-detail-display-toggle__btn${mode === option.mode ? " is-active" : ""}`}
          type="button"
          aria-pressed={mode === option.mode ? "true" : "false"}
          onClick={() => onChange(option.mode)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function NodeFieldPreview({
  field,
  value,
  displayMode,
  relativeLinkRoot,
  onOpenRelativeLink,
}: {
  field: EditableField;
  value: string;
  displayMode: FieldDisplayMode;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
}) {
  if (!value.trim()) {
    return <p className="node-detail-empty">(empty string)</p>;
  }
  if (displayMode === "markdown" && supportsDisplayMode(field)) {
    return (
      <MarkdownValue
        value={value}
        previewSurface
        relativeLinkRoot={relativeLinkRoot}
        onOpenRelativeLink={onOpenRelativeLink}
      />
    );
  }
  if (field.name === "key" || typeof field.value === "string") {
    return <p className="node-detail-text">{value}</p>;
  }
  return <pre className="node-detail-pre">{value}</pre>;
}
