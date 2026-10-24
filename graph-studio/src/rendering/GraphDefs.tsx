import { DEFAULT_GRAPH_CSS,GRAPH_EFFECTS_CSS } from "../styles/graphAppearance";
import { GRAPH_BASE_CSS } from "../styles/graphBaseStyles";
import { TIMELINE_CSS,timelineMarkerId } from "../styles/timelineStyles";

const ARROW_MARKER_WIDTH = 10;
const ARROW_MARKER_HEIGHT = 8;

interface GraphDefsProps {
  edgeArrowStyle?: "filled" | "open";
  appearanceCss: string;
  timelineColors?: string[];
}

export default function GraphDefs({ appearanceCss, timelineColors = [], edgeArrowStyle = "filled" }: GraphDefsProps) {
  return (
    <defs>
      <style>{`@layer graph-base, graph-theme, graph-custom;\n@layer graph-base {${GRAPH_BASE_CSS}\n${DEFAULT_GRAPH_CSS}}\n@layer graph-theme {${GRAPH_EFFECTS_CSS}\n${TIMELINE_CSS}}\n@layer graph-custom {${appearanceCss}}`}</style>
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
        refX={edgeArrowStyle === "open" ? 9 : ARROW_MARKER_WIDTH - 0.4}
        refY={ARROW_MARKER_HEIGHT / 2}
      >
        <path
          d={
            edgeArrowStyle === "open"
              ? "M1 1 L9 4 L1 7"
              : `M 0 0 L ${ARROW_MARKER_WIDTH} ${ARROW_MARKER_HEIGHT / 2} L 0 ${ARROW_MARKER_HEIGHT} z`
          }
          fill={edgeArrowStyle === "open" ? "none" : "context-stroke"}
          stroke={edgeArrowStyle === "open" ? "context-stroke" : undefined}
          strokeWidth={edgeArrowStyle === "open" ? 1 : undefined}
          strokeLinecap={edgeArrowStyle === "open" ? "round" : undefined}
          strokeLinejoin={edgeArrowStyle === "open" ? "round" : undefined}
        />
      </marker>
      <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
        <feGaussianBlur stdDeviation="10" />
      </filter>
    </defs>
  );
}
