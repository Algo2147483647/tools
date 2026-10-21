import type { StageNode } from "../layout/types";

export default function SpatialNode({
  node,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocusChange,
}: {
  node: StageNode;
  onClick(key: string): void;
  onDoubleClick(key: string): void;
  onContextMenu(event: React.MouseEvent<SVGGElement>, key: string): void;
  onFocusChange(key: string | null): void;
}) {
  const spatial = node.spatial!;
  return (
    <g
      className="dag-node spatial-node"
      data-key={node.key}
      data-type={node.typeLabel}
      transform={`translate(${node.x},${node.y})`}
      tabIndex={0}
      role="button"
      aria-label={`${node.title}, ${node.typeLabel || "untyped"}, [${spatial.coordinates.join(", ")}]`}
      onClick={(e) => {
        e.stopPropagation();
        onClick(node.key);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onDoubleClick(node.key);
      }}
      onContextMenu={(e) => onContextMenu(e, node.key)}
      onFocus={() => onFocusChange(node.key)}
      onBlur={() => onFocusChange(null)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onDoubleClick(node.key);
        }
        if (e.key === " ") {
          e.preventDefault();
          onClick(node.key);
        }
      }}
    >
      <title>{`${node.title}${node.typeLabel ? ` · ${node.typeLabel}` : ""}\n[${spatial.coordinates.join(", ")}]${node.detail ? `\n${node.detail}` : ""}`}</title>
      <circle className="spatial-hit" r={Math.max(8, spatial.radius + 4)} fill="transparent" />
      <circle
        className="spatial-point"
        r={spatial.radius}
        fill={spatial.hollow ? "none" : spatial.color}
        stroke={spatial.hollow ? spatial.color : undefined}
        strokeWidth={spatial.hollow ? 1.2 : undefined}
        opacity={(spatial.opacity ?? 1) * (0.65 + (spatial.depth + 1) * 0.175)}
      />
      <circle
        className="spatial-selection"
        r={spatial.radius + 5}
        fill="none"
        stroke={spatial.color}
        strokeWidth="1.5"
      />
      <text
        className={spatial.showLabel ? "spatial-label" : "spatial-label spatial-label--on-focus"}
        x={(spatial.radius + 6) * (spatial.labelSide === "left" ? -1 : 1)}
        textAnchor={spatial.labelSide === "left" ? "end" : "start"}
        y="4"
      >
        {node.displayTitle}
      </text>
    </g>
  );
}
