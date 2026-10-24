import { type CSSProperties } from "react";
import { type GraphAppearance } from "../graph/appearance";
import type { StageData } from "../layout/shared/types";
import type { ViewportChromeRefs } from "../viewport/useTimelineRulerViewport";
import { appearanceToStageStyle } from "./appearanceStyle";
import GraphBackdrop from "./GraphBackdrop";
import GraphDefs from "./GraphDefs";
import GraphEdge from "./GraphEdge";
import { GroupControls,GroupHeader } from "./GraphGroup";
import GraphNode from "./GraphNode";
import { useStageHighlight } from "./interaction/useStageHighlight";
import SpatialNode from "./SpatialNode";
import TimelineBackdrop from "./TimelineBackdrop";
import TimelineNode from "./TimelineNode";
import { TimelineRuler } from "./TimelineRuler";

function groupBackgroundFill(palettes: string[][], familyIndex: number, depth: number): string {
  const palette = palettes[familyIndex % palettes.length];
  return palette[Math.min(palette.length - 1, Math.max(0, depth))];
}

interface GraphStageProps extends ViewportChromeRefs {
  onGroupToggle?: (id: string) => void;
  onGroupEnter?: (id: string) => void;
  stage: StageData;
  focusedKey: string | null;
  hideNodeBorders: boolean;
  appearance: GraphAppearance;
  svgRef: React.RefObject<SVGSVGElement>;
  onTimelineNodePin?: (key: string, x: number) => void;
  onNodeClick: (key: string) => void;
  onNodeDoubleClick: (key: string) => void;
  onNodeContextMenu: (event: React.MouseEvent<SVGGElement>, key: string) => void;
  onBackgroundContextMenu: (event: React.MouseEvent<Element>) => void;
  onFocusChange: (key: string | null) => void;
}

export default function GraphStage({
  topbarRef, overlaysRef,
  stage,
  focusedKey,
  hideNodeBorders,
  appearance,
  svgRef,
  onTimelineNodePin,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onBackgroundContextMenu,
  onFocusChange,
  onGroupToggle,
  onGroupEnter,
}: GraphStageProps) {
  useStageHighlight(stage, focusedKey, svgRef);
  const isDenseStage =
    stage.nodes.length >= appearance.performance.denseThresholds[0] ||
    stage.edges.length >= appearance.performance.denseThresholds[1] ||
    stage.stageWidth * stage.stageHeight >= appearance.performance.denseThresholds[2];
  const stageStyle = appearanceToStageStyle(appearance) as CSSProperties;

  return (
    <svg
      className="dag-graph"
      data-layout={stage.layoutMode}
      data-dense-shadows={appearance.performance.denseShadows}
      data-density={isDenseStage ? "dense" : "normal"}
      data-borderless={hideNodeBorders ? "true" : "false"}
      data-has-interactive-node="false"
      ref={svgRef}
      viewBox={`0 0 ${stage.stageWidth} ${stage.stageHeight}`}
      width={stage.stageWidth}
      height={stage.stageHeight}
      style={stageStyle}
      role={
        stage.layoutMode === "spatial" || stage.layoutMode === "compound" || stage.layoutMode === "timeline"
          ? "group"
          : "img"
      }
      aria-label={`${stage.layoutMode === "spatial" ? "Spatial" : stage.layoutMode === "timeline" ? "Timeline" : stage.layoutMode === "compound" ? "Nested graph" : stage.layoutMode === "sankey" ? "Sankey flow" : "DAG"} view focused on ${stage.selection.label}`}
      onContextMenu={onBackgroundContextMenu}
    >
      <GraphDefs
        edgeArrowStyle={appearance.display.edgeArrowStyle}
        appearanceCss={appearance.css}
        timelineColors={Array.from(
          new Set(stage.edges.flatMap((edge) => (edge.timeline ? [edge.timeline.color] : []))),
        )}
      />
      {stage.spatial ? (
        <g className="spatial-guides" aria-hidden="true" pointerEvents="none">
          {stage.spatial.guides.map((guide, index) => (
            <g key={index}>
              <path d={guide.path} />
              {guide.label && (
                <text x={guide.x} y={guide.y}>
                  {guide.label}
                </text>
              )}
            </g>
          ))}
        </g>
      ) : stage.timeline ? (
        <TimelineBackdrop stage={stage} />
      ) : (
        stage.layoutMode !== "sankey" && stage.layoutMode !== "compound" && <GraphBackdrop stage={stage} />
      )}
      <g className="dag-group-backgrounds">
        {stage.groups?.map((group) => (
          <rect
            key={group.id}
            data-group-id={group.id}
            data-depth={group.depth}
            className="dag-group-background"
            style={
              {
                "--dag-group-fill": groupBackgroundFill(appearance.palette.groups, group.colorFamilyIndex, group.depth),
                ...(appearance.display.showGroupBorders ? {} : { stroke: "none" }),
              } as CSSProperties
            }
            x={group.x}
            y={group.y}
            width={group.width}
            height={group.height}
            rx={12}
          />
        ))}
      </g>
      {stage.timeline && (
        <g className="timeline-leader-layer" aria-hidden="true" pointerEvents="none">
          {stage.nodes.map((node) => (
            <TimelineNode
              key={node.key}
              layer="leader"
              node={node}
              isActive={node.key === stage.root}
              onClick={onNodeClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ))}
        </g>
      )}
      <g className="dag-edge-layer">
        {stage.edges.map((edge) => (
          <GraphEdge key={edge.id} edge={edge} showLabel={appearance.display.showEdgeLabels} />
        ))}
      </g>
      <g className="dag-node-layer">
        {stage.nodes.map((node) =>
          node.spatial ? (
            <SpatialNode
              key={node.key}
              node={node}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ) : (
            <GraphNode
              key={node.key}
              node={node}
              showGroupStats={appearance.display.showGroupStats}
              nodeCornerRadius={appearance.display.nodeCornerRadius}
              isActive={node.key === stage.root}
              onTimelineNodePin={onTimelineNodePin}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ),
        )}
      </g>
      <g className="dag-group-headers">
        {stage.groups?.map((group) => (
          <GroupHeader
            key={group.id}
            group={group}
            showStats={appearance.display.showGroupStats}
            onNodeClick={onNodeClick}
            onNodeDoubleClick={onNodeDoubleClick}
            onNodeContextMenu={onNodeContextMenu}
            onFocusChange={onFocusChange}
            onToggle={onGroupToggle}
            onEnter={onGroupEnter}
          />
        ))}
        {stage.nodes
          .filter((node) => node.kind === "group")
          .map((node) => (
            <GroupControls
              key={node.key}
              id={node.key}
              x={node.x + node.width / 2 - 64}
              y={node.y - node.height / 2 + 8}
              collapsed
              external={node.external}
              onToggle={onGroupToggle}
              onEnter={onGroupEnter}
            />
          ))}
      </g>
      {stage.timeline && (
        <g className="timeline-label-layer">
          {stage.nodes.map((node) => (
            <TimelineNode
              key={node.key}
              layer="label"
              node={node}
              isActive={node.key === stage.root}
              onPin={onTimelineNodePin}
              onClick={onNodeClick}
              onDoubleClick={onNodeDoubleClick}
              onContextMenu={onNodeContextMenu}
              onFocusChange={onFocusChange}
            />
          ))}
        </g>
      )}
      {stage.timeline && <TimelineRuler stage={stage} svgRef={svgRef} topbarRef={topbarRef} overlaysRef={overlaysRef} />}
    </svg>
  );

}
