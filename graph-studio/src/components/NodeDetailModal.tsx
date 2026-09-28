import { useEffect, useState } from "react";
import type { DagNode, NodeKey } from "../graph/types";
import { getMappedFieldName, type FieldMapping } from "../graph/fieldMapping";
import { getRelationKeys } from "../graph/relations";
import type { RelativeLinkRoot } from "../adapters/relativeLinks";
import NodeFieldEditor, { LinkValue, MarkdownValue, buildEditableFields, formatEditorValue, hasDisplayLink, parseNodeFieldValue, supportsDisplayMode, type EditableField, type FieldDisplayMode } from "./NodeFieldEditor";
import { buildRawNodeEditorValue, parseRawNodeEditorValue } from "./nodeDetailRawJson";

interface NodeDetailModalProps {
  open: boolean;
  nodeKey: NodeKey | null;
  node: DagNode | null;
  fieldMapping: FieldMapping;
  initialFocus?: "fields" | "raw";
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onRelativeLinkError: (message: string) => void;
  onSave: (nextKey: NodeKey, fields: Record<string, unknown>) => void;
  onClose: () => void;
}

export default function NodeDetailModal({ open, nodeKey, node, fieldMapping, initialFocus = "fields", relativeLinkRoot, onOpenRelativeLink, onRelativeLinkError, onSave, onClose }: NodeDetailModalProps) {
  const [fields, setFields] = useState<EditableField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawJsonValue, setRawJsonValue] = useState("");
  const [lastEdited, setLastEdited] = useState<"fields" | "raw">("fields");
  const [fieldDisplayModes, setFieldDisplayModes] = useState<Record<string, FieldDisplayMode>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && node && nodeKey) {
      const nextFields = buildEditableFields(nodeKey, node, fieldMapping);
      setFields(nextFields);
      setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
      setRawJsonValue(buildRawNodeEditorValue(nodeKey, node, fieldMapping));
      setLastEdited("fields");
      setFieldDisplayModes(buildDefaultFieldDisplayModes(nextFields));
      setIsEditing(false);
      setError("");
    }
  }, [fieldMapping, node, nodeKey, open]);

  useEffect(() => {
    if (open) {
      setIsFullscreen(false);
    }
  }, [nodeKey, open]);

  useEffect(() => {
    if (!open || !isEditing || initialFocus !== "raw") {
      return;
    }
    const frame = window.requestAnimationFrame(() => {
      document.getElementById("node-detail-json")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialFocus, isEditing, open, nodeKey]);

  if (!open || !node || !nodeKey) {
    return null;
  }

  const currentNodeKey = nodeKey;
  const draftKey = String(values.key || currentNodeKey).trim() || currentNodeKey;

  return (
    <div id="node-detail-modal" className={`node-detail-modal is-visible${isFullscreen ? " is-fullscreen" : ""}`} aria-hidden="false">
      <div className="node-detail-page" role="dialog" aria-modal="true" aria-labelledby="node-detail-title">
        <div className="node-detail-header">
          <div className="node-detail-header-main">
            <div>
              <h3 id="node-detail-title">{draftKey}</h3>
            </div>
          </div>
          <div className="node-detail-actions">
            {isEditing ? (
              <button id="node-detail-save" className="primary-btn node-detail-save-btn" type="button" title="Save" aria-label="Save" onClick={handleSave}>
                <SaveIcon />
              </button>
            ) : (
              <button id="node-detail-edit" className="ghost-btn node-detail-edit-btn" type="button" title="Edit" aria-label="Edit" onClick={() => setIsEditing(true)}>
                <EditIcon />
              </button>
            )}
            <button
              id="node-detail-fullscreen"
              className="ghost-btn node-detail-fullscreen-btn"
              type="button"
              title={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-label={isFullscreen ? "Exit fullscreen" : "Fullscreen"}
              aria-pressed={isFullscreen ? "true" : "false"}
              onClick={() => setIsFullscreen((current) => !current)}
            >
              <FullscreenIcon active={isFullscreen} />
            </button>
            <button id="node-detail-close" className="ghost-btn modal-icon-close-btn" type="button" title="Close" aria-label="Close" onClick={onClose}>
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="node-detail-body">
          <section className="node-detail-section">
            <h4>Node Fields</h4>
            <div id="node-detail-fields" className="node-detail-fields">
              {fields.length ? fields.map((field) => (
                <article key={field.name} className="node-detail-field">
                  <div className="node-detail-field__header">
                    <p className="node-detail-field__label">{field.displayName}</p>
                    {supportsDisplayMode(field) ? (
                      <FieldDisplayModeToggle
                        mode={fieldDisplayModes[field.name] || "text"}
                        onChange={(mode) => setFieldDisplayMode(field.name, mode)}
                      />
                    ) : null}
                  </div>
                  {isEditing ? (
                    <NodeFieldEditor
                      field={field}
                      value={values[field.name] ?? ""}
                      displayMode={fieldDisplayModes[field.name] || "text"}
                      relativeLinkRoot={relativeLinkRoot}
                      onOpenRelativeLink={onOpenRelativeLink}
                      onRelativeLinkError={onRelativeLinkError}
                      onChange={(value) => handleFieldChange(field.name, value)}
                    />
                  ) : (
                    <NodeFieldPreview
                      field={field}
                      value={values[field.name] ?? ""}
                      displayMode={fieldDisplayModes[field.name] || "text"}
                      relativeLinkRoot={relativeLinkRoot}
                      onOpenRelativeLink={onOpenRelativeLink}
                      onRelativeLinkError={onRelativeLinkError}
                    />
                  )}
                </article>
              )) : <p className="node-detail-empty">No fields are available for this node.</p>}
              {error ? <p className="node-detail-error">{error}</p> : null}
            </div>
          </section>
          <section className="node-detail-section">
            <h4>Raw JSON</h4>
            {isEditing ? (
              <div className="node-detail-editor-wrap">
                <textarea
                  id="node-detail-json"
                  className="node-detail-editor node-detail-editor--textarea node-detail-editor--json"
                  rows={16}
                  spellCheck={false}
                  value={rawJsonValue}
                  onChange={(event) => handleRawJsonChange(event.currentTarget.value)}
                />
              </div>
            ) : (
              <pre id="node-detail-json-preview" className="node-detail-json">{rawJsonValue}</pre>
            )}
          </section>
        </div>
      </div>
    </div>
  );

  function handleFieldChange(fieldName: string, value: string) {
    const nextValues = { ...values, [fieldName]: value };
    setValues(nextValues);
    setLastEdited("fields");
    setError("");

    const nextRawJson = tryBuildRawJsonFromFieldValues(fields, nextValues, currentNodeKey, fieldMapping);
    if (nextRawJson) {
      setRawJsonValue(nextRawJson);
    }
  }

  function handleRawJsonChange(nextRawJson: string) {
    setRawJsonValue(nextRawJson);
    setLastEdited("raw");
    setError("");

    const parsed = parseRawNodeEditorValue(nextRawJson, currentNodeKey, fieldMapping);
    if (!parsed.ok) {
      return;
    }

    const nextFields = buildEditableFields(parsed.nextKey, { ...parsed.fields, key: parsed.nextKey }, fieldMapping);
    setFields(nextFields);
    setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
    setFieldDisplayModes((current) => {
      const defaults = buildDefaultFieldDisplayModes(nextFields);
      return Object.fromEntries(Object.keys(defaults).map((fieldName) => [fieldName, current[fieldName] ?? defaults[fieldName]]));
    });
  }

  function handleSave() {
    if (lastEdited === "raw") {
      const parsed = parseRawNodeEditorValue(rawJsonValue, currentNodeKey, fieldMapping);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      if (!validateNodeRelations(parsed.nextKey, parsed.fields, fieldMapping)) {
        setError("A node cannot reference itself.");
        return;
      }
      onSave(parsed.nextKey, parsed.fields);
      setIsEditing(false);
      return;
    }

    const nextKey = String(values.key || "").trim();
    if (!nextKey) {
      setError("Node key cannot be empty.");
      return;
    }
    if (nextKey.includes("\n") || nextKey.includes(",")) {
      setError("Node key cannot contain commas or line breaks.");
      return;
    }

    const patch: Record<string, unknown> = {};
    for (const field of fields) {
      if (field.name === "key") {
        continue;
      }
      const parsed = parseNodeFieldValue(field, values[field.name] ?? "");
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      patch[field.name] = parsed.value;
    }

    if (!validateNodeRelations(nextKey, patch, fieldMapping)) {
      setError("A node cannot reference itself.");
      return;
    }
    onSave(nextKey, patch);
    setIsEditing(false);
  }

  function setFieldDisplayMode(fieldName: string, mode: FieldDisplayMode) {
    setFieldDisplayModes((current) => ({ ...current, [fieldName]: mode }));
  }
}

function FieldDisplayModeToggle({
  mode,
  onChange,
}: {
  mode: FieldDisplayMode;
  onChange: (mode: FieldDisplayMode) => void;
}) {
  const modes: Array<{ mode: FieldDisplayMode; label: string }> = [
    { mode: "markdown", label: "Markdown" },
    { mode: "link", label: "Link" },
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

function tryBuildRawJsonFromFieldValues(
  fields: EditableField[],
  values: Record<string, string>,
  fallbackKey: NodeKey,
  fieldMapping: FieldMapping,
): string | null {
  const nextKey = String(values.key ?? fallbackKey).trim();
  if (!nextKey || nextKey.includes("\n") || nextKey.includes(",")) {
    return null;
  }

  const patch: Record<string, unknown> = {};
  for (const field of fields) {
    if (field.name === "key") {
      continue;
    }
    const parsed = parseNodeFieldValue(field, values[field.name] ?? "");
    if (!parsed.ok) {
      return null;
    }
    patch[field.name] = parsed.value;
  }

  if (!validateNodeRelations(nextKey, patch, fieldMapping)) {
    return null;
  }

  return buildRawNodeEditorValue(nextKey, patch, fieldMapping);
}

function validateNodeRelations(nextKey: NodeKey, fields: Record<string, unknown>, fieldMapping: FieldMapping): boolean {
  const parentKeys = getRelationKeys(fields[getMappedFieldName(fieldMapping, "parents")]);
  const childKeys = getRelationKeys(fields[getMappedFieldName(fieldMapping, "children")]);
  return !parentKeys.includes(nextKey) && !childKeys.includes(nextKey);
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

function FullscreenIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M8 3v5H3" />
        <path d="M21 8h-5V3" />
        <path d="M16 21v-5h5" />
        <path d="M3 16h5v5" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 8V3h5" />
      <path d="M16 3h5v5" />
      <path d="M21 16v5h-5" />
      <path d="M8 21H3v-5" />
    </svg>
  );
}

function NodeFieldPreview({
  field,
  value,
  displayMode,
  relativeLinkRoot,
  onOpenRelativeLink,
  onRelativeLinkError,
}: {
  field: EditableField;
  value: string;
  displayMode: FieldDisplayMode;
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onRelativeLinkError: (message: string) => void;
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
        onRelativeLinkError={onRelativeLinkError}
      />
    );
  }
  if (displayMode === "link" && supportsDisplayMode(field)) {
    return (
      <LinkValue
        value={value}
        previewSurface
        relativeLinkRoot={relativeLinkRoot}
        onOpenRelativeLink={onOpenRelativeLink}
      />
    );
  }
  if (field.name === "key" || field.editorKind === "plainText" || field.editorKind === "multilineText") {
    return <p className="node-detail-text">{value}</p>;
  }
  return <pre className="node-detail-pre">{value}</pre>;
}

function buildDefaultFieldDisplayModes(fields: EditableField[]): Record<string, FieldDisplayMode> {
  return Object.fromEntries(fields.filter((field) => supportsDisplayMode(field)).map((field) => {
    const value = formatEditorValue(field);
    return [field.name, hasDisplayLink(value) ? "link" : "markdown"];
  }));
}
