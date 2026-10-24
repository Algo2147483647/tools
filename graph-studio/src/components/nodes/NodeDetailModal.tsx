import { useEffect, useState } from "react";
import type { RelativeLinkRoot } from "../../workspace/relativeLinks";
import { getTimelineClock } from "../../graph/timeline/clock";
import type { DagNode, NodeKey, NormalizedDag } from "../../graph/types";
import Icon from "../ui/Icon";
import NodeFieldEditor from "./NodeFieldEditor";
import { FieldDisplayModeToggle, NodeFieldPreview } from "./NodeFieldPreview";
import { supportsDisplayMode } from "./nodeFields";
import NodeJsonView from "./NodeJsonView";
import NodeRelationsPanel from "./NodeRelationsPanel";
import NodeTimeEditor from "./NodeTimeEditor";
import { useNodeDraft } from "./useNodeDraft";

const NODE_DETAIL_TABS = [
  { id: "fields", label: "Node Fields" },
  { id: "raw", label: "Raw JSON" },
  { id: "edges", label: "Edges" },
] as const;
type NodeDetailTab = (typeof NODE_DETAIL_TABS)[number]["id"];

interface NodeDetailModalProps {
  open: boolean;
  nodeKey: NodeKey | null;
  node: DagNode | null;
  graph: NormalizedDag | null;
  timeline?: boolean;
  timelineReferenceTime?: number;
  initialFocus?: "fields" | "raw";
  relativeLinkRoot: RelativeLinkRoot | null;
  onOpenRelativeLink: (url: string) => void;
  onSave: (nextKey: NodeKey, fields: Record<string, unknown>) => string | void;
  onClose: () => void;
}

export default function NodeDetailModal({
  open,
  nodeKey,
  node,
  graph,
  timeline = false,
  timelineReferenceTime,
  initialFocus = "fields",
  relativeLinkRoot,
  onOpenRelativeLink,
  onSave,
  onClose,
}: NodeDetailModalProps) {
  const {
    fields,
    values,
    rawJsonValue,
    fieldDisplayModes,
    isEditing,
    setIsEditing,
    error,
    handleFieldChange,
    getDraftValue,
    handleTimelineChange,
    handleRawJsonChange,
    handleSave,
    setFieldDisplayMode,
  } = useNodeDraft({ open, nodeKey, node, graph, timelineReferenceTime, onSave });
  const [isFullscreen, setIsFullscreen] = useState(true);
  const [activeTab, setActiveTab] = useState<NodeDetailTab>(initialFocus);

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
                <Icon name="save" className="modal-icon-close-svg" />
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
              <Icon name={isFullscreen ? "collapse" : "expand"} className="modal-icon-close-svg" />
            </button>
            <button
              id="node-detail-close"
              className="ghost-btn modal-icon-close-btn"
              type="button"
              title="Close"
              aria-label="Close"
              onClick={onClose}
            >
              <Icon name="close" className="modal-icon-close-svg" />
            </button>
          </div>
        </div>
        <div className="node-detail-body">
          <div className="node-detail-tabs" role="tablist" aria-label="Node content">
            {NODE_DETAIL_TABS.map(({ id: tab, label }, index) => (
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
                  let nextIndex: number;
                  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
                    const step = event.key === "ArrowRight" ? 1 : -1;
                    nextIndex = (index + step + NODE_DETAIL_TABS.length) % NODE_DETAIL_TABS.length;
                  } else if (event.key === "Home") {
                    nextIndex = 0;
                  } else if (event.key === "End") {
                    nextIndex = NODE_DETAIL_TABS.length - 1;
                  } else {
                    return;
                  }
                  event.preventDefault();
                  const nextTab = NODE_DETAIL_TABS[nextIndex].id;
                  setActiveTab(nextTab);
                  document.getElementById(`node-detail-tab-${nextTab}`)?.focus();
                }}
              >
                {label}
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
                clock={getTimelineClock(graph?.metadata)}
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
                        <h3 className="node-detail-field__label">{field.name}</h3>
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
                            onChange={(value) => handleFieldChange(field.name, value)}
                          />
                        ) : (
                          <NodeFieldPreview
                            field={field}
                            value={values[field.name] ?? ""}
                            displayMode={fieldDisplayModes[field.name] || "text"}
                            relativeLinkRoot={relativeLinkRoot}
                            onOpenRelativeLink={onOpenRelativeLink}
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
          <section
            id="node-detail-panel-edges"
            className="node-detail-tab-panel"
            role="tabpanel"
            aria-labelledby="node-detail-tab-edges"
            tabIndex={0}
            hidden={activeTab !== "edges"}
          >
            <NodeRelationsPanel graph={graph} nodeKey={currentNodeKey} />
          </section>
        </div>
      </div>
    </div>
  );
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
