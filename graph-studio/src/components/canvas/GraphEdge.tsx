import { edgeLabelSize } from "../../layout/shared/edge-label";
import { type TextFont } from "../../layout/shared/typography";
import { memo } from "react";
import type { StageEdge } from "../../layout/shared/types";
import { timelineMarkerId } from "../../styles/timelineStyles";

interface GraphEdgeProps {
  edge: StageEdge;
  showLabel: boolean;
  labelFont: TextFont;
}

const GraphEdge = memo(function GraphEdge({ edge, showLabel, labelFont }: GraphEdgeProps) {
  return (
    <g
      className="dag-edge"
      data-source={edge.source}
      data-target={edge.target}
      data-weight={String(edge.weight ?? "")}
      data-label={edge.label}
      data-active="false"
      data-feedback={edge.flow?.feedback || undefined}
      data-timeline-kind={edge.timeline?.kind}
      data-backward={edge.timeline?.backward || undefined}
    >
      <title>{edge.description || `${edge.source} → ${edge.target}: ${edge.label}`}</title>
      {edge.timeline ? (
        <path
          className="dag-edge__timeline"
          d={edge.path}
          stroke={edge.timeline.color}
          markerEnd={`url(#${timelineMarkerId(edge.timeline.color)})`}
        />
      ) : edge.spatial ? (
        <path
          className="dag-edge__path"
          d={edge.path}
          style={{
            stroke: edge.spatial.color,
            strokeWidth: edge.spatial.width,
            strokeDasharray: edge.spatial.dashed ? "3 3" : undefined,
            markerEnd: edge.spatial.directed ? "url(#arrowhead)" : "none",
          }}
        />
      ) : edge.flow ? (
        <path className="dag-edge__flow" d={edge.path} stroke={edge.flow.color} strokeWidth={edge.flow.width} />
      ) : (
        <path className="dag-edge__path" d={edge.path} markerEnd="url(#arrowhead)" />
      )}
      {edge.flow?.directionPath && (
        <path d={edge.flow.directionPath} fill="none" stroke={edge.flow.color} strokeWidth={2} pointerEvents="none" />
      )}
      {showLabel && edge.label ? (
        <EdgeLabel font={labelFont} label={edge.label} x={edge.labelPosition.x} y={edge.labelPosition.y} />
      ) : null}
    </g>
  );
}, areEqualGraphEdgeProps);

export default GraphEdge;

function areEqualGraphEdgeProps(previous: GraphEdgeProps, next: GraphEdgeProps): boolean {
  return (
    previous.edge === next.edge &&
    previous.showLabel === next.showLabel &&
    previous.labelFont.size === next.labelFont.size &&
    previous.labelFont.family === next.labelFont.family &&
    previous.labelFont.weight === next.labelFont.weight &&
    previous.labelFont.style === next.labelFont.style
  );
}

function EdgeLabel({ label, x, y, font }: { label: string; x: number; y: number; font: TextFont }) {
  const { width, height } = edgeLabelSize(label, font);

  return (
    <>
      <rect
        className="dag-edge__label-bg"
        x={x - width / 2}
        y={y - height / 2}
        width={width}
        height={height}
        rx={8}
        ry={8}
      />
      <text className="dag-edge__label-text" x={x} y={y} dominantBaseline="central" textAnchor="middle">
        {label}
      </text>
    </>
  );
}
