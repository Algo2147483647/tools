import Icon from "../ui/Icon";
import type { StageGroup } from "../../layout/shared/types";
import { layoutGroupTitle } from "../../layout/shared/group-title";

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
          transform={`translate(${i * 32}, 0)`}
          role="button"
          tabIndex={0}
          aria-label={`${action === "enter" ? "Enter" : collapsed ? "Expand" : "Collapse"} ${id}`}
          aria-expanded={action === "toggle" ? !collapsed : undefined}
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
          <title>{action === "enter" ? "Focus subgraph" : collapsed ? "Expand subgraph" : "Collapse subgraph"}</title>
          <rect width={28} height={28} rx={8} />
          <Icon x={6} y={6} size={16} name={action === "enter" ? "enter-group" : collapsed ? "expand" : "collapse"} />
        </g>
      ))}
    </g>
  );
}

export function GroupHeader({
  group,
  showStats = true,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onFocusChange,
  onToggle,
  onEnter,
}: {
  group: StageGroup;
  showStats?: boolean;
  onNodeClick?: (id: string) => void;
  onNodeDoubleClick?: (id: string) => void;
  onNodeContextMenu?: (event: React.MouseEvent<SVGGElement>, id: string) => void;
  onFocusChange?: (id: string | null) => void;
  onToggle?: (id: string) => void;
  onEnter?: (id: string) => void;
}) {
  const titleLines = layoutGroupTitle(group.title, group.width, group.titleMetrics);
  return (
    <g
      className="dag-group-header dag-node"
      data-key={group.id}
      onClick={() => onNodeClick?.(group.id)}
      onDoubleClick={() => onNodeDoubleClick?.(group.id)}
      onContextMenu={(event) => onNodeContextMenu?.(event, group.id)}
      onFocus={() => onFocusChange?.(group.id)}
      onBlur={() => onFocusChange?.(null)}
      data-group-id={group.id}
      tabIndex={0}
      role="group"
      aria-label={`${group.title} subgraph`}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onNodeClick?.(group.id);
        }
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
      <text className="dag-group-title">
        {titleLines.map((line, index) => (
          <tspan key={index} x={group.x + line.x} y={group.y + line.baseline}>
            {line.text}
          </tspan>
        ))}
      </text>
      {showStats && (
        <text x={group.x + 16} y={group.y + 44 + (titleLines.length - 1) * 18} className="dag-group-count">
          {group.leafCount} node{group.leafCount === 1 ? "" : "s"}
        </text>
      )}
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
