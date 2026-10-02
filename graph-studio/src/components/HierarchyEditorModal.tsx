import { useMemo, useState } from "react";
import { getNodeTitle } from "../graph/accessors";
import type { GraphCommand } from "../graph/commands";
import { indexHierarchy, isHierarchyDescendant } from "../graph/hierarchy";
import type { NormalizedDag } from "../graph/types";

export type HierarchyEdit =
  | { mode: "create"; parentId: string | null; selectedIds: string[] }
  | { mode: "move"; memberIds: string[] }
  | { mode: "rename"; id: string }
  | { mode: "add-node"; parentId: string | null };

export default function HierarchyEditorModal({
  edit,
  dag,
  onSave,
  onClose,
}: {
  edit: HierarchyEdit;
  dag: NormalizedDag;
  onSave: (commands: GraphCommand[], label: string) => string | undefined;
  onClose: () => void;
}) {
  const index = useMemo(() => indexHierarchy(dag), [dag]);
  const groups = dag.hierarchy?.groups ?? {};
  const [name, setName] = useState(edit.mode === "rename" ? (groups[edit.id]?.title ?? "") : "");
  const [nodeId, setNodeId] = useState(() => uniqueId(dag, "node"));
  const [selected, setSelected] = useState(edit.mode === "create" ? edit.selectedIds : []);
  const [destination, setDestination] = useState(
    edit.mode === "move" ? (index.parent.get(edit.memberIds[0]) ?? "") : "",
  );
  const [filter, setFilter] = useState("");
  const [error, setError] = useState("");
  const title =
    edit.mode === "create"
      ? "Create subgraph"
      : edit.mode === "move"
        ? "Move to subgraph"
        : edit.mode === "rename"
          ? "Rename subgraph"
          : "Add node";
  const label = (id: string) =>
    Object.prototype.hasOwnProperty.call(groups, id) ? groups[id].title || id : getNodeTitle(dag.nodes[id]) || id;
  const parentLabel = "parentId" in edit && edit.parentId ? label(edit.parentId) : "Top level";
  const members = edit.mode === "create" ? (index.children.get(edit.parentId) ?? []) : [];
  const visibleMembers = members.filter((id) => `${id} ${label(id)}`.toLowerCase().includes(filter.toLowerCase()));
  const destinations =
    edit.mode === "move"
      ? Object.keys(groups).filter((id) => !edit.memberIds.some((member) => isHierarchyDescendant(index, id, member)))
      : [];

  function save() {
    let commands: GraphCommand[];
    if (edit.mode === "create") {
      if (!name.trim() || !selected.length) {
        setError("Name the subgraph and select at least one member.");
        return;
      }
      commands = [{ type: "groupCreate", id: uniqueId(dag, "group"), title: name.trim(), memberIds: selected }];
    } else if (edit.mode === "move") {
      commands = [{ type: "groupMove", memberIds: edit.memberIds, parentId: destination || null }];
    } else if (edit.mode === "rename") {
      if (!name.trim()) {
        setError("Enter a subgraph name.");
        return;
      }
      commands = [{ type: "groupRename", id: edit.id, title: name.trim() }];
    } else {
      commands = [{ type: "addNodeFromFields", key: nodeId.trim(), fields: { title: name.trim() || nodeId.trim() } }];
      if (edit.parentId) commands.push({ type: "groupMove", memberIds: [nodeId.trim()], parentId: edit.parentId });
    }
    const message = onSave(commands, title);
    if (message) setError(message);
    else onClose();
  }

  return (
    <div
      className="hierarchy-editor-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <form
        className="hierarchy-editor-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="hierarchy-editor-title"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            onClose();
          }
          if (event.key === "Tab") {
            const focusable = [
              ...event.currentTarget.querySelectorAll<HTMLElement>("button:not(:disabled),input,select"),
            ];
            const first = focusable[0],
              last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            }
            if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <header>
          <div>
            <h2 id="hierarchy-editor-title">{title}</h2>
            <p>
              {edit.mode === "move"
                ? edit.memberIds.map(label).join(", ")
                : edit.mode === "rename"
                  ? edit.id
                  : `Inside ${parentLabel}`}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close subgraph editor">
            ×
          </button>
        </header>
        {edit.mode === "add-node" && (
          <label>
            Node ID
            <input value={nodeId} autoFocus onChange={(event) => setNodeId(event.target.value)} />
          </label>
        )}
        {edit.mode !== "move" && (
          <label>
            {edit.mode === "add-node" ? "Node title" : "Subgraph name"}
            <input
              value={name}
              autoFocus={edit.mode !== "add-node"}
              onChange={(event) => setName(event.target.value)}
            />
          </label>
        )}
        {edit.mode === "create" && (
          <>
            <div className="hierarchy-member-toolbar">
              <strong>Members · {selected.length} selected</strong>
              <button type="button" onClick={() => setSelected(visibleMembers)}>
                Select shown
              </button>
              <button type="button" onClick={() => setSelected([])}>
                Clear
              </button>
            </div>
            <input
              aria-label="Find members"
              placeholder="Find members…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
            />
            <div className="hierarchy-member-list">
              {visibleMembers.map((id) => (
                <label key={id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    onChange={(event) =>
                      setSelected(event.target.checked ? [...selected, id] : selected.filter((member) => member !== id))
                    }
                  />
                  <span>
                    {label(id)}
                    <small>
                      {Object.prototype.hasOwnProperty.call(groups, id) ? "Subgraph" : "Node"} · {id}
                    </small>
                  </span>
                </label>
              ))}
              {!members.length && <p>Add a node before creating a subgraph.</p>}
            </div>
          </>
        )}
        {edit.mode === "move" && (
          <label>
            Destination
            <select autoFocus value={destination} onChange={(event) => setDestination(event.target.value)}>
              <option value="">Top level</option>
              {destinations.map((id) => (
                <option key={id} value={id}>
                  {label(id)} · {id}
                </option>
              ))}
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="hierarchy-editor-error">
            {error}
          </p>
        )}
        <footer>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={edit.mode === "create" && (!selected.length || !name.trim())}>
            {edit.mode === "create"
              ? "Create subgraph"
              : edit.mode === "move"
                ? "Move"
                : edit.mode === "add-node"
                  ? "Add node"
                  : "Save name"}
          </button>
        </footer>
      </form>
    </div>
  );
}

function uniqueId(dag: NormalizedDag, prefix: string) {
  const ids = new Set([...Object.keys(dag.nodes), ...Object.keys(dag.hierarchy?.groups ?? {})]);
  let number = 1;
  while (ids.has(`${prefix}-${number}`)) number++;
  return `${prefix}-${number}`;
}
