import type { RelativeLinkRoot } from "../adapters/relativeLinks";
import MarkdownValue from "./MarkdownValue";
import {
  type EditableField,
  type FieldDisplayMode,
  getEditorHint,
  getEditorRows,
  supportsDisplayMode,
} from "./nodeFields";

interface NodeFieldEditorProps {
  field: EditableField;
  value: string;
  displayMode: FieldDisplayMode;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onRelativeLinkError: (message: string) => void;
  onChange: (value: string) => void;
}

export default function NodeFieldEditor({
  field,
  value,
  displayMode,
  relativeLinkRoot,
  onOpenRelativeLink,
  onRelativeLinkError,
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
        rows={getEditorRows(field)}
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
          onRelativeLinkError={onRelativeLinkError}
        />
      ) : null}
      {getEditorHint(field) ? <p className="node-detail-editor-hint">{getEditorHint(field)}</p> : null}
    </div>
  );
}
