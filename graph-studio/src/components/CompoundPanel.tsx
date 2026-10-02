import { useMemo, useState } from "react";
import { getNodeTitle } from "../graph/accessors";
import { indexHierarchy } from "../graph/hierarchy";
import type { GraphCommand } from "../graph/commands";
import type { CompoundView, NormalizedDag } from "../graph/types";
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
  const groups = dag.hierarchy?.groups ?? {};
  const focus = view.focusGroupId && has(groups, view.focusGroupId) ? view.focusGroupId : null;
  const children = index.children.get(focus) ?? [];
  const [checked, setChecked] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [target, setTarget] = useState("");
  const [error, setError] = useState("");
  function runCommand(command: GraphCommand) {
    const message = onCommand(command);
    setError(message ?? "");
    return message;
  }
  const selected = checked.filter((id) => children.includes(id));
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
    <details className="compound-panel" open>
      <summary>
        Subgraphs <span>{Object.keys(groups).length}</span>
      </summary>
      <nav className="compound-breadcrumb" aria-label="Subgraph path">
        <button onClick={() => enter(null)}>All</button>
        {path.map((id) => (
          <span key={id}>
            {" "}
            /{" "}
            <button onClick={() => enter(id)} aria-current={id === focus ? "location" : undefined}>
              {groups[id].title || id}
            </button>
          </span>
        ))}
      </nav>
      <div className="compound-panel-actions">
        <button onClick={() => onViewChange({ ...view, collapsedGroupIds: [] })}>Expand all</button>
        <button
          onClick={() => onViewChange({ ...view, collapsedGroupIds: Object.keys(groups).filter((id) => id !== focus) })}
        >
          Collapse all
        </button>
      </div>
      <p>Select members to group or move. Enter a subgraph to edit its members.</p>
      {error && <p role="alert">{error}</p>}
      <div className="compound-members" role="group" aria-label="Subgraph members">
        {children.map((id) => {
          const group = has(groups, id);
          return (
            <div className="compound-member" key={id} onContextMenu={(event) => onMemberContextMenu(event, id)}>
              <input
                type="checkbox"
                aria-label={`Select ${id}`}
                checked={selected.includes(id)}
                onChange={(event) =>
                  setChecked(event.target.checked ? [...selected, id] : selected.filter((item) => item !== id))
                }
              />
              <button
                className="compound-member-name"
                title={id}
                onClick={() => onSelect(id)}
                onDoubleClick={() => (group ? enter(id) : onOpenNode(id))}
              >
                {group ? groups[id].title || id : getNodeTitle(dag.nodes[id]) || id}
              </button>
              {group && (
                <>
                  <button
                    aria-label={`${view.collapsedGroupIds.includes(id) ? "Expand" : "Collapse"} ${id}`}
                    onClick={() => toggle(id)}
                  >
                    {view.collapsedGroupIds.includes(id) ? "+" : "−"}
                  </button>
                  <button aria-label={`Enter ${id}`} onClick={() => enter(id)}>
                    ↗
                  </button>
                </>
              )}
            </div>
          );
        })}
        {!children.length && <p>No members.</p>}
      </div>
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
          {Object.entries(groups).map(([id, group]) => (
            <option key={id} value={id}>
              {group.title || id} ({id})
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
      {selected.length === 1 && has(groups, selected[0]) && (
        <div className="compound-panel-actions">
          <button
            onClick={() => {
              const title = window.prompt("Subgraph name:", groups[selected[0]].title);
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
    </details>
  );
}
