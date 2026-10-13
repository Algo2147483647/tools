import { GRAPH_EFFECTS_CSS } from "../graph/appearance";
import { TIMELINE_CSS, timelineMarkerId } from "./timelineStyles";

const ARROW_MARKER_WIDTH = 10;
const ARROW_MARKER_HEIGHT = 8;

interface GraphDefsProps {
  appearanceCss: string;
  timelineColors?: string[];
}

export default function GraphDefs({ appearanceCss, timelineColors = [] }: GraphDefsProps) {
  return (
    <defs>
      <style>{`${appearanceCss}\n${GRAPH_EFFECTS_CSS}\n${TIMELINE_CSS}`}</style>
      {timelineColors.map((color) => (
        <marker
          key={color}
          id={timelineMarkerId(color)}
          viewBox="0 0 8 6"
          orient="auto"
          markerUnits="userSpaceOnUse"
          markerWidth={8}
          markerHeight={6}
          refX={14.5}
          refY={3}
        >
          <path d="M0 0 L8 3 L0 6 z" fill={color} />
        </marker>
      ))}
      <marker
        id="arrowhead"
        viewBox={`0 0 ${ARROW_MARKER_WIDTH} ${ARROW_MARKER_HEIGHT}`}
        orient="auto"
        markerUnits="userSpaceOnUse"
        markerWidth={ARROW_MARKER_WIDTH}
        markerHeight={ARROW_MARKER_HEIGHT}
        refX={ARROW_MARKER_WIDTH - 0.4}
        refY={ARROW_MARKER_HEIGHT / 2}
      >
        <path
          d={`M 0 0 L ${ARROW_MARKER_WIDTH} ${ARROW_MARKER_HEIGHT / 2} L 0 ${ARROW_MARKER_HEIGHT} z`}
          fill="context-stroke"
        />
      </marker>
      <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
    </defs>
  );
}
