import Icon from "../ui/Icon";
import { useMemo, useState } from "react";
import { getNodeTitle } from "../../graph/accessors";
import type { GraphCommand } from "../../graph/commands";
import { getGroupNodes, indexHierarchy } from "../../graph/compound/hierarchy";
import type { CompoundView, NormalizedDag } from "../../graph/types";
const has = (value: object, id: string) => Object.prototype.hasOwnProperty.call(value, id);

export default function CompoundPanel({
  dag,
  view,
  onViewChange,
  onCommand,
  onSelect,
  onOpenNode,
  onMemberContextMenu,
}: {
  dag: NormalizedDag;
  view: CompoundView;
  onViewChange: (view: CompoundView) => void;
  onCommand: (command: GraphCommand) => string | undefined;
  onSelect: (id: string) => void;
  onOpenNode: (id: string) => void;
  onMemberContextMenu: (event: React.MouseEvent<Element>, id: string) => void;
}) {
  const index = useMemo(() => indexHierarchy(dag), [dag]);
  const groups = getGroupNodes(dag);
  const focus = view.focusGroupId && has(groups, view.focusGroupId) ? view.focusGroupId : null;
  const children = index.children.get(focus) ?? [];
  const [editing, setEditing] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  function runCommand(command: GraphCommand) {
    const message = onCommand(command);
    setError(message ?? "");
    return message;
  }
  const rows: { id: string; depth: number }[] = [];
  const pending = children.map((id) => ({ id, depth: 0 })).reverse();
  while (pending.length) {
    const row = pending.pop()!;
    rows.push(row);
    if (has(groups, row.id) && !view.collapsedGroupIds.includes(row.id)) {
      const members = index.children.get(row.id) ?? [];
      for (let i = members.length - 1; i >= 0; i--) pending.push({ id: members[i], depth: row.depth + 1 });
    }
  }
  const scopeGroups = Object.keys(groups).filter(
    (id) =>
      id !== focus &&
      (!focus ||
        (() => {
          for (let p = index.parent.get(id); p; p = index.parent.get(p)) if (p === focus) return true;
          return false;
        })()),
  );
  const selected = checked.filter((id) => rows.some((row) => row.id === id));
  const path: string[] = [];
  let ancestor = focus;
  while (ancestor) {
    path.unshift(ancestor);
    ancestor = index.parent.get(ancestor) ?? null;
  }
  const enter = (id: string | null) => {
    setChecked([]);
    onViewChange({ ...view, focusGroupId: id });
  };
  const toggle = (id: string) =>
    onViewChange({
      ...view,
      collapsedGroupIds: view.collapsedGroupIds.includes(id)
        ? view.collapsedGroupIds.filter((item) => item !== id)
        : [...view.collapsedGroupIds, id],
    });
  function createGroup() {
    const used = new Set([...Object.keys(dag.nodes), ...Object.keys(groups)]);
    let n = 1;
    while (used.has(`group-${n}`)) n++;
    if (
      !runCommand({ type: "groupCreate", id: `group-${n}`, title: name.trim() || `Group ${n}`, memberIds: selected })
    ) {
      setChecked([]);
      setName("");
    }
  }
  return (
    <section className="compound-panel" aria-label="Subgraph structure">
      <div className="workbench-section-heading">
        <h3>Subgraphs</h3>
        <button
          className="workbench-text-button"
          aria-pressed={editing}
          onClick={() => {
            setEditing(!editing);
            setChecked([]);
          }}
        >
          Edit membership
        </button>
      </div>
      <nav className="compound-breadcrumb" aria-label="Subgraph path">
        <button onClick={() => enter(null)}>All</button>
        {path.map((id) => (
          <span key={id}>
            {" "}
            /{" "}
            <button onClick={() => enter(id)} aria-current={id === focus ? "location" : undefined}>
              {getNodeTitle(groups[id]) || id}
            </button>
          </span>
        ))}
      </nav>
      <div className="compound-quick-actions">
        <button
          disabled={!scopeGroups.some((id) => view.collapsedGroupIds.includes(id))}
          onClick={() =>
            onViewChange({
              ...view,
              collapsedGroupIds: view.collapsedGroupIds.filter((id) => !scopeGroups.includes(id)),
            })
          }
        >
          <Icon name="expand" size={16} />
          Expand all
        </button>
        <button
          disabled={!scopeGroups.some((id) => !view.collapsedGroupIds.includes(id))}
          onClick={() =>
            onViewChange({ ...view, collapsedGroupIds: [...new Set([...view.collapsedGroupIds, ...scopeGroups])] })
          }
        >
          <Icon name="collapse" size={16} />
          Collapse all
        </button>
      </div>
      {error && <p role="alert">{error}</p>}
      <div className="compound-members" role="group" aria-label="Subgraph members">
        {rows.map(({ id, depth }) => {
          const group = has(groups, id);
          return (
            <div
              className="compound-member"
              style={{ paddingLeft: depth * 16 }}
              key={id}
              onContextMenu={(event) => onMemberContextMenu(event, id)}
            >
              {editing && (
                <input
                  type="checkbox"
                  aria-label={`Select ${id}`}
                  checked={selected.includes(id)}
                  onChange={(event) =>
                    setChecked(event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))
                  }
                />
              )}
              {group ? (
                <button
                  className="compound-tree-toggle"
                  title={view.collapsedGroupIds.includes(id) ? "Expand subgraph" : "Collapse subgraph"}
                  aria-label={`${view.collapsedGroupIds.includes(id) ? "Expand" : "Collapse"} ${id}`}
                  aria-expanded={!view.collapsedGroupIds.includes(id)}
                  onClick={() => toggle(id)}
                >
                  <Icon name="chevron" size={16} />
                </button>
              ) : (
                <span className="compound-leaf-mark" aria-hidden="true" />
              )}
              <button
                className="compound-member-name"
                title={id}
                onClick={() => onSelect(id)}
                onDoubleClick={() => onOpenNode(id)}
              >
                {group ? getNodeTitle(groups[id]) || id : getNodeTitle(dag.nodes[id]) || id}
              </button>
              {group && (
                <>
                  <button
                    className="compound-enter"
                    title={`Focus ${getNodeTitle(groups[id]) || id}`}
                    aria-label={`Enter ${id}`}
                    onClick={() => enter(id)}
                  >
                    <Icon name="enter-group" size={16} />
                  </button>
                </>
              )}
            </div>
          );
        })}
        {!children.length && <p>No members.</p>}
      </div>
      {editing && selected.length > 0 && (
        <>
          <div className="compound-panel-actions">
            <input
              aria-label="New group name"
              placeholder="Group name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <button disabled={!selected.length} onClick={createGroup}>
              Group {selected.length || ""}
            </button>
          </div>
          <div className="compound-panel-actions">
            <select aria-label="Move members to" value={target} onChange={(event) => setTarget(event.target.value)}>
              <option value="">Top level</option>
              {Object.entries(dag.nodes).map(([id, group]) => (
                <option key={id} value={id}>
                  {getNodeTitle(group) || id} ({id})
                </option>
              ))}
            </select>
            <button
              disabled={!selected.length}
              onClick={() => {
                if (!runCommand({ type: "groupMove", memberIds: selected, parentId: target || null })) setChecked([]);
              }}
            >
              Move
            </button>
          </div>
        </>
      )}
      {editing && selected.length === 1 && has(groups, selected[0]) && (
        <div className="compound-panel-actions">
          <button
            onClick={() => {
              const title = window.prompt("Subgraph name:", getNodeTitle(groups[selected[0]]));
              if (title !== null) runCommand({ type: "groupRename", id: selected[0], title });
            }}
          >
            Rename
          </button>
          <button
            onClick={() => {
              if (!runCommand({ type: "groupDissolve", id: selected[0] })) setChecked([]);
            }}
          >
            Ungroup
          </button>
        </div>
      )}
    </section>
  );
}
