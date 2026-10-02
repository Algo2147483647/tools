import type { StageGroup } from "../layout/types";
import { truncateTitleToWidth } from "../layout/text";

export function GroupControls({
  id,
  x,
  y,
  collapsed,
  external,
  onToggle,
  onEnter,
}: {
  id: string;
  x: number;
  y: number;
  collapsed: boolean;
  external?: boolean;
  onToggle?: (id: string) => void;
  onEnter?: (id: string) => void;
}) {
  return (
    <g transform={`translate(${x}, ${y})`} className="dag-group-controls" data-group-id={id}>
      {(!external ? ["toggle", "enter"] : ["enter"]).map((action, i) => (
        <g
          key={action}
          transform={`translate(${i * 28}, 0)`}
          role="button"
          tabIndex={0}
          aria-label={`${action === "enter" ? "Enter" : collapsed ? "Expand" : "Collapse"} ${id}`}
          onClick={(event) => {
            event.stopPropagation();
            (action === "enter" ? onEnter : onToggle)?.(id);
          }}
          onDoubleClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              event.stopPropagation();
              (action === "enter" ? onEnter : onToggle)?.(id);
            }
          }}
        >
          <rect width={24} height={24} rx={5} />
          <text x={12} y={17} textAnchor="middle">
            {action === "enter" ? "↗" : collapsed ? "+" : "−"}
          </text>
        </g>
      ))}
    </g>
  );
}

export function GroupHeader({
  group,
  onToggle,
  onEnter,
}: {
  group: StageGroup;
  onToggle?: (id: string) => void;
  onEnter?: (id: string) => void;
}) {
  return (
    <g
      className="dag-group-header"
      data-group-id={group.id}
      tabIndex={0}
      role="group"
      aria-label={`${group.title} subgraph`}
      onKeyDown={(event) => {
        if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
          event.preventDefault();
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          event.currentTarget.dispatchEvent(
            new MouseEvent("contextmenu", { bubbles: true, clientX: rect.left + 20, clientY: rect.top + 20 }),
          );
        }
      }}
    >
      <title>{`${group.title} · ${group.leafCount} nodes`}</title>
      <text x={group.x + 16} y={group.y + 26} className="dag-group-title">
        {truncateTitleToWidth(group.title, group.width - 55)}
      </text>
      <text x={group.x + 16} y={group.y + 44} className="dag-group-count">
        {group.leafCount} nodes
      </text>
      <GroupControls
        id={group.id}
        x={group.x + group.width - 70}
        y={group.y + 12}
        collapsed={false}
        onToggle={onToggle}
        onEnter={onEnter}
      />
    </g>
  );
}
