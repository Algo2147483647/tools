import { type CSSProperties } from "react";
import { type GraphAppearance } from "../../../graph/appearance";
import type { StageData } from "../../../layout/shared/types";
import GraphDefs from "../../../rendering/GraphDefs";
import GraphEdge from "../../../rendering/GraphEdge";
import TimelineBackdrop from "../../../rendering/TimelineBackdrop";
import TimelineNode from "../../../rendering/TimelineNode";
import { appearanceToStageStyle } from "../../../rendering/appearanceStyle";


export function TimelineMiniature({
  stage,
  appearance,
  scale,
}: {
  stage: StageData;
  appearance: GraphAppearance;
  scale: number | null;
}) {
  return (
    <div className="timeline-layout-preview" tabIndex={0} aria-label="Scrollable timeline preview">
      <svg
        className="dag-graph"
        data-layout="timeline"
        data-export="true"
        style={
          {
            ...appearanceToStageStyle(appearance),
            width: scale ? stage.stageWidth * scale : "100%",
            height: scale ? stage.stageHeight * scale : "100%",
          } as CSSProperties
        }
        viewBox={`0 0 ${stage.stageWidth} ${stage.stageHeight}`}
        role="img"
        aria-label="Timeline layout preview"
      >
        <GraphDefs
          appearanceCss={appearance.css}
          edgeArrowStyle={appearance.display.edgeArrowStyle}
          timelineColors={[...new Set(stage.edges.flatMap((edge) => (edge.timeline ? [edge.timeline.color] : [])))]}
        />
        <TimelineBackdrop stage={stage} />
        {stage.nodes.map((node) => (
          <TimelineNode
            key={node.key}
            node={node}
            layer="leader"
            readOnly
            isActive={false}
            onClick={() => {}}
            onContextMenu={() => {}}
            onFocusChange={() => {}}
          />
        ))}
        {stage.edges.map((edge) => (
          <GraphEdge key={edge.id} edge={edge} showLabel={false} />
        ))}
        {(["marker", "label"] as const).map((layer) =>
          stage.nodes.map((node) => (
            <TimelineNode
              key={`${layer}-${node.key}`}
              node={node}
              layer={layer}
              readOnly
              isActive={false}
              onClick={() => {}}
              onContextMenu={() => {}}
              onFocusChange={() => {}}
            />
          )),
        )}
      </svg>
    </div>
  );
}
