import type { RelativeLinkRoot } from "../../adapters/relativeLinks";
import MarkdownValue from "../content/MarkdownValue";
import { type EditableField,type FieldDisplayMode,supportsDisplayMode } from "./nodeFields";

interface NodeFieldEditorProps {
  field: EditableField;
  value: string;
  displayMode: FieldDisplayMode;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onChange: (value: string) => void;
}

export default function NodeFieldEditor({
  field,
  value,
  displayMode,
  relativeLinkRoot,
  onOpenRelativeLink,
  onChange,
}: NodeFieldEditorProps) {
  if (field.name === "key") {
    return (
      <input
        className="node-detail-editor node-detail-editor--input node-detail-editor--key"
        type="text"
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    );
  }

  return (
    <div className="node-detail-editor-wrap">
      <textarea
        className="node-detail-editor node-detail-editor--textarea"
        rows={field.name === "define" ? 8 : typeof field.value === "string" ? 3 : 6}
        spellCheck={false}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {displayMode === "markdown" && supportsDisplayMode(field) ? (
        <MarkdownValue
          value={value}
          previewSurface
          relativeLinkRoot={relativeLinkRoot}
          onOpenRelativeLink={onOpenRelativeLink}
        />
      ) : null}
      {typeof field.value !== "string" && <p className="node-detail-editor-hint">Enter valid JSON.</p>}
    </div>
  );
}
