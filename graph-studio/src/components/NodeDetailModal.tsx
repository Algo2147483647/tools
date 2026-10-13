import { useEffect, useState } from "react";
import type { RelativeLinkRoot } from "../adapters/relativeLinks";
import { getRelationKeys } from "../graph/relations";
import { getTimelineEditError } from "../graph/timelineEditing";
import type { DagNode, NodeKey } from "../graph/types";
import NodeFieldEditor, {
  type EditableField,
  type FieldDisplayMode,
  MarkdownValue,
  buildEditableFields,
  formatEditorValue,
  parseNodeFieldValue,
  supportsDisplayMode,
} from "./NodeFieldEditor";
import { buildRawNodeEditorValue, parseRawNodeEditorValue } from "./nodeDetailRawJson";
import { CloseIcon, FullscreenIcon } from "./ui/ModalIcons";
import NodeTimeEditor from "./NodeTimeEditor";
import NodeJsonView from "./NodeJsonView";

interface NodeDetailModalProps {
  open: boolean;
  nodeKey: NodeKey | null;
  node: DagNode | null;
  timeline?: boolean;
  timelineReferenceTime?: number;
  initialFocus?: "fields" | "raw";
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onRelativeLinkError: (message: string) => void;
  onSave: (nextKey: NodeKey, fields: Record<string, unknown>) => string | void;
  onClose: () => void;
}

export default function NodeDetailModal({
  open,
  nodeKey,
  node,
  timeline = false,
  timelineReferenceTime,
  initialFocus = "fields",
  relativeLinkRoot,
  onOpenRelativeLink,
  onRelativeLinkError,
  onSave,
  onClose,
}: NodeDetailModalProps) {
  const [fields, setFields] = useState<EditableField[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [rawJsonValue, setRawJsonValue] = useState("");
  const [lastEdited, setLastEdited] = useState<"fields" | "raw">("fields");
  const [fieldDisplayModes, setFieldDisplayModes] = useState<Record<string, FieldDisplayMode>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [activeTab, setActiveTab] = useState<"fields" | "raw">(initialFocus);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open && node && nodeKey) {
      const nextFields = buildEditableFields(nodeKey, node);
      setFields(nextFields);
      setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
      setRawJsonValue(buildRawNodeEditorValue(nodeKey, node));
      setLastEdited("fields");
      setFieldDisplayModes(buildDefaultFieldDisplayModes(nextFields));
      setIsEditing(false);
      setError("");
    }
  }, [node, nodeKey, open]);

  useEffect(() => {
    if (open) {
      setIsFullscreen(true);
    }
  }, [nodeKey, open]);

  useEffect(() => {
    if (open) {
      setActiveTab(initialFocus);
    }
  }, [initialFocus, nodeKey, open]);

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
  const draftTitle = typeof node.title === "string" ? values.title?.trim() : "";
  const showTimeEditor = timeline || fields.some((field) => field.name === "time");

  return (
    <div
      id="node-detail-modal"
      className={`node-detail-modal is-visible${isFullscreen ? " is-fullscreen" : ""}`}
      aria-hidden="false"
    >
      <div className="node-detail-page" role="dialog" aria-modal="true" aria-labelledby="node-detail-title">
        <div className="node-detail-header">
          <h1 id="node-detail-title" className="node-detail-title" title={draftTitle || draftKey}>
            {draftTitle || draftKey}
          </h1>
          <div className="node-detail-actions">
            {isEditing ? (
              <button
                id="node-detail-save"
                className="primary-btn node-detail-save-btn"
                type="button"
                title="Save"
                aria-label="Save"
                onClick={handleSave}
              >
                <SaveIcon />
              </button>
            ) : (
              <button
                id="node-detail-edit"
                className="ghost-btn node-detail-edit-btn"
                type="button"
                title="Edit"
                aria-label="Edit"
                onClick={() => setIsEditing(true)}
              >
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
            <button
              id="node-detail-close"
              className="ghost-btn modal-icon-close-btn"
              type="button"
              title="Close"
              aria-label="Close"
              onClick={onClose}
            >
              <CloseIcon />
            </button>
          </div>
        </div>
        <div className="node-detail-body">
          <div className="node-detail-tabs" role="tablist" aria-label="Node content">
            {(["fields", "raw"] as const).map((tab) => (
              <button
                key={tab}
                id={`node-detail-tab-${tab}`}
                className="node-detail-tab"
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                aria-controls={`node-detail-panel-${tab}`}
                tabIndex={activeTab === tab ? 0 : -1}
                onClick={() => setActiveTab(tab)}
                onKeyDown={(event) => {
                  let nextTab: "fields" | "raw";
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    nextTab = tab === "fields" ? "raw" : "fields";
                  } else if (event.key === "Home") {
                    nextTab = "fields";
                  } else if (event.key === "End") {
                    nextTab = "raw";
                  } else {
                    return;
                  }
                  event.preventDefault();
                  setActiveTab(nextTab);
                  document.getElementById(`node-detail-tab-${nextTab}`)?.focus();
                }}
              >
                {tab === "fields" ? "Node Fields" : "Raw JSON"}
              </button>
            ))}
          </div>
          {error ? (
            <p className="node-detail-error" role="alert">
              {error}
            </p>
          ) : null}
          <section
            id="node-detail-panel-fields"
            className="node-detail-tab-panel"
            role="tabpanel"
            aria-labelledby="node-detail-tab-fields"
            tabIndex={0}
            hidden={activeTab !== "fields"}
          >
            {showTimeEditor && (
              <NodeTimeEditor
                time={getDraftValue("time")}
                track={getDraftValue("track")}
                readOnly={!isEditing}
                referenceTime={timelineReferenceTime}
                onChange={handleTimelineChange}
              />
            )}
            <div id="node-detail-fields" className="node-detail-fields">
              {fields.length ? (
                fields
                  .filter((field) => !showTimeEditor || !["time", "track"].includes(field.name))
                  .map((field) => (
                    <article key={field.name} className="node-detail-field">
                      <div className="node-detail-field__header">
                        <h3 className="node-detail-field__label">{field.displayName}</h3>
                        {supportsDisplayMode(field) ? (
                          <FieldDisplayModeToggle
                            mode={fieldDisplayModes[field.name] || "text"}
                            onChange={(mode) => setFieldDisplayMode(field.name, mode)}
                          />
                        ) : null}
                      </div>
                      <div className="node-detail-field__value">
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
                      </div>
                    </article>
                  ))
              ) : (
                <p className="node-detail-empty">No fields are available for this node.</p>
              )}
            </div>
          </section>
          <section
            id="node-detail-panel-raw"
            className="node-detail-tab-panel"
            role="tabpanel"
            aria-labelledby="node-detail-tab-raw"
            tabIndex={0}
            hidden={activeTab !== "raw"}
          >
            <NodeJsonView value={rawJsonValue} editable={isEditing} onChange={handleRawJsonChange} />
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

    const nextRawJson = tryBuildRawJsonFromFieldValues(fields, nextValues, currentNodeKey);
    if (nextRawJson) {
      setRawJsonValue(nextRawJson);
    }
  }

  function getDraftValue(name: string): unknown {
    const field = fields.find((item) => item.name === name);
    if (!field) return undefined;
    const parsed = parseNodeFieldValue(field, values[name] ?? "");
    return parsed.ok ? parsed.value : values[name];
  }

  function handleTimelineChange(time: unknown, track: string) {
    const nextFields = fields.filter((field) => !["time", "track"].includes(field.name));
    const added = buildEditableFields(currentNodeKey, {
      ...(time === undefined ? {} : { time }),
      ...(track ? { track } : {}),
    }).filter((field) => field.name !== "key");
    nextFields.push(...added);
    const nextValues = { ...values };
    delete nextValues.time;
    delete nextValues.track;
    for (const field of added) nextValues[field.name] = formatEditorValue(field);
    setFields(nextFields);
    setValues(nextValues);
    setLastEdited("fields");
    setError("");
    const raw = tryBuildRawJsonFromFieldValues(nextFields, nextValues, currentNodeKey);
    if (raw) setRawJsonValue(raw);
  }

  function handleRawJsonChange(nextRawJson: string) {
    setRawJsonValue(nextRawJson);
    setLastEdited("raw");
    setError("");

    const parsed = parseRawNodeEditorValue(nextRawJson);
    if (!parsed.ok) {
      return;
    }

    const nextFields = buildEditableFields(parsed.nextKey, { ...parsed.fields, key: parsed.nextKey });
    setFields(nextFields);
    setValues(Object.fromEntries(nextFields.map((field) => [field.name, formatEditorValue(field)])));
    setFieldDisplayModes((current) => {
      const defaults = buildDefaultFieldDisplayModes(nextFields);
      return Object.fromEntries(
        Object.keys(defaults).map((fieldName) => [fieldName, current[fieldName] ?? defaults[fieldName]]),
      );
    });
  }

  function handleSave() {
    if (lastEdited === "raw") {
      const parsed = parseRawNodeEditorValue(rawJsonValue);
      if (!parsed.ok) {
        setError(parsed.message);
        return;
      }
      if (!validateNodeRelations(parsed.nextKey, parsed.fields)) {
        setError("A node cannot reference itself.");
        return;
      }
      saveValidated(parsed.nextKey, parsed.fields);
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

    const patch: Record<string, unknown> = Object.create(null);
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

    if (!validateNodeRelations(nextKey, patch)) {
      setError("A node cannot reference itself.");
      return;
    }
    saveValidated(nextKey, patch);
  }

  function saveValidated(nextKey: NodeKey, patch: Record<string, unknown>) {
    const timeError = getTimelineEditError(node ?? undefined, patch, timelineReferenceTime);
    if (timeError) {
      setError(timeError);
      return;
    }
    const saveError = onSave(nextKey, patch);
    if (saveError) {
      setError(saveError);
      return;
    }
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
): string | null {
  const nextKey = String(values.key ?? fallbackKey).trim();
  if (!nextKey || nextKey.includes("\n") || nextKey.includes(",")) {
    return null;
  }

  const patch: Record<string, unknown> = Object.create(null);
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

  if (!validateNodeRelations(nextKey, patch)) {
    return null;
  }

  return buildRawNodeEditorValue(nextKey, patch);
}

function validateNodeRelations(nextKey: NodeKey, fields: Record<string, unknown>): boolean {
  const parentKeys = getRelationKeys(fields.parents);
  const childKeys = getRelationKeys(fields.children);
  return !parentKeys.includes(nextKey) && !childKeys.includes(nextKey);
}

function EditIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="modal-icon-close-svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

function SaveIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="modal-icon-close-svg"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
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
  if (field.name === "key" || field.editorKind === "plainText" || field.editorKind === "multilineText") {
    return <p className="node-detail-text">{value}</p>;
  }
  return <pre className="node-detail-pre">{value}</pre>;
}

function buildDefaultFieldDisplayModes(fields: EditableField[]): Record<string, FieldDisplayMode> {
  return Object.fromEntries(
    fields.filter((field) => supportsDisplayMode(field)).map((field) => [field.name, "markdown"]),
  );
}
