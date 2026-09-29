import { memo, type CSSProperties, type KeyboardEvent } from "react";
import type { StageNode } from "../layout/types";
import { formatFlow } from "../graph/sankey";

const DETAIL_LINE_HEIGHT = 10;
const AFFORDANCE_HORIZONTAL_PADDING = 8;
const AFFORDANCE_MIN_WIDTH = 32;
const AFFORDANCE_MAX_INSET = 16;
const AFFORDANCE_TEXT_AVERAGE_WIDTH = 5.2;

interface GraphNodeProps {
  node: StageNode;
  isActive: boolean;
  onClick: (key: string) => void;
  onDoubleClick?: (key: string) => void;
  onContextMenu: (event: React.MouseEvent<SVGGElement>, key: string) => void;
  onFocusChange: (key: string | null) => void;
}

const GraphNode = memo(function GraphNode({
  node,
  isActive,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocusChange,
}: GraphNodeProps) {
  const hasDetail = node.detailLines.length > 0;
  const style = node.colorTokens ? ({
    "--dag-node-glow": node.colorTokens.glow,
    "--dag-node-border": node.colorTokens.border,
    "--dag-node-border-strong": node.colorTokens.borderStrong,
    "--dag-node-active-border": node.colorTokens.activeBorder,
    "--dag-node-pin-fill": node.colorTokens.pinFill,
    "--dag-node-pin-stroke": node.colorTokens.pinStroke,
    "--dag-node-pin-core": node.colorTokens.pinCore,
    "--dag-node-affordance-bg": node.colorTokens.affordanceBg,
    "--dag-node-affordance-text": node.colorTokens.affordanceText,
  } as CSSProperties) : undefined;
  const affordanceLabel = node.typeLabel || "";
  const affordanceWidth = Math.min(
    Math.max(
      Math.ceil(affordanceLabel.length * AFFORDANCE_TEXT_AVERAGE_WIDTH) + AFFORDANCE_HORIZONTAL_PADDING * 2,
      AFFORDANCE_MIN_WIDTH,
    ),
    node.width - AFFORDANCE_MAX_INSET * 2,
  );
  const affordanceX = node.width - AFFORDANCE_MAX_INSET - affordanceWidth;

  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onClick(node.key);
    }
  }

  const nodeAriaDescription = [
    node.title,
    node.detail ? `${node.detail}.` : "",
    node.isRoot ? "Current focus." : "Activate to focus this branch.",
  ].filter(Boolean).join(" ");

  return (
    <g
      className="dag-node"
      data-key={node.key}
      data-flow={node.flow ? "true" : "false"}
      data-type={node.typeLabel || ""}
      data-root={node.isRoot ? "true" : "false"}
      data-selected={isActive ? "true" : "false"}
      data-focused="false"
      data-hovered="false"
      data-connected="false"
      data-layer={node.layer}
      data-order={node.order}
      style={style}
      transform={`translate(${node.x - node.width / 2}, ${node.y - node.height / 2})`}
      tabIndex={0}
      role="button"
      aria-label={node.flow ? `${node.title}. Flow ${formatFlow(node.flow.value)}. Incoming ${formatFlow(node.flow.incoming)}, outgoing ${formatFlow(node.flow.outgoing)}.` : nodeAriaDescription}
      onClick={() => onClick(node.key)}
      onDoubleClick={() => onDoubleClick?.(node.key)}
      onContextMenu={(event) => onContextMenu(event, node.key)}
      onFocus={() => onFocusChange(node.key)}
      onBlur={() => onFocusChange(null)}
      onKeyDown={handleKeyDown}
    >
      {node.flow ? <>
        <title>{`${node.title}\nIncoming: ${formatFlow(node.flow.incoming)}\nOutgoing: ${formatFlow(node.flow.outgoing)}${node.detail ? `\n${node.detail}` : ""}`}</title>
        <rect className="dag-node__shape" width={node.width} height={node.flow.value === 0 ? 2 : node.height} rx={2} style={{ fill: node.flow.color, stroke: node.flow.color }} />
        {Math.abs(node.flow.labelY - node.y) > 2 && <path d={`M${node.width},${node.height / 2}L${node.width + 8},${node.flow.labelY - node.y + node.height / 2}`} fill="none" stroke={node.flow.color} strokeWidth={1} opacity={0.5} />}
        <text className="dag-node__flow-label" x={node.flow.labelSide === "left" ? -12 : node.width + 12} y={node.flow.labelY - node.y + node.height / 2 - 3} textAnchor={node.flow.labelSide === "left" ? "end" : "start"}>
          {node.displayTitle}
          <tspan className="dag-node__flow-value" x={node.flow.labelSide === "left" ? -12 : node.width + 12} dy={18}>
            {node.flow.incoming > 0 && node.flow.outgoing > 0 && Math.abs(node.flow.incoming - node.flow.outgoing) > node.flow.value * 1e-9
              ? `${formatFlow(node.flow.incoming)} in · ${formatFlow(node.flow.outgoing)} out`
              : formatFlow(node.flow.value)}
          </tspan>
        </text>
      </> : <>
      <rect className="dag-node__shape" width={node.width} height={node.height} rx={24} ry={24} />
      <circle className="dag-node__pin" cx={26} cy={node.height / 2} r={7} />
      <circle className="dag-node__pin-core" cx={26} cy={node.height / 2} r={2.25} />
      <text
        className="dag-node__title"
        x={48}
        y={hasDetail ? 29 : node.height / 2}
        dominantBaseline={hasDetail ? undefined : "middle"}
      >
        {node.displayTitle}
      </text>
      {hasDetail ? (
        <text className="dag-node__detail" x={48} y={45}>
          {node.detailLines.map((line, index) => (
            <tspan key={`${line}-${index}`} x={48} dy={index === 0 ? 0 : DETAIL_LINE_HEIGHT}>
              {line}
            </tspan>
          ))}
        </text>
      ) : null}
      {affordanceLabel ? (
        <g className="dag-node__affordance">
          <rect className="dag-node__affordance-bg" x={affordanceX} y={node.height - 21} width={affordanceWidth} height={14} rx={7} ry={7} />
          <text className="dag-node__affordance-text" x={affordanceX + affordanceWidth / 2} y={node.height - 10} textAnchor="middle">
            {affordanceLabel}
          </text>
        </g>
      ) : null}
      </>}
    </g>
  );
}, areEqualGraphNodeProps);

export default GraphNode;

function areEqualGraphNodeProps(previous: GraphNodeProps, next: GraphNodeProps): boolean {
  return previous.node === next.node
    && previous.isActive === next.isActive
    && previous.onClick === next.onClick
    && previous.onDoubleClick === next.onDoubleClick
    && previous.onContextMenu === next.onContextMenu
    && previous.onFocusChange === next.onFocusChange;
}
