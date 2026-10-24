import type { RefObject } from "react";
import { sanitizeTimelineClock,timelineClockCaption } from "../graph/timeline/clock";
import type { StageData } from "../layout/shared/types";
import { getTimelineAxisTicks,getVisibleTimeTicks } from "../layout/timeline/ticks";
import { useTimelineRulerViewport,type ViewportChromeRefs } from "../viewport/useTimelineRulerViewport";
export function TimelineRuler({ stage, svgRef, topbarRef, overlaysRef }: { stage: StageData; svgRef: RefObject<SVGSVGElement> } & ViewportChromeRefs) {
  const timeline = stage.timeline!;
  const viewport = useTimelineRulerViewport(stage, svgRef, {topbarRef, overlaysRef});
  const { scale, x, top, bottom } = viewport;
  const caption = timelineClockCaption(timeline.clock ?? sanitizeTimelineClock(null));
  const horizontal = timeline.orientation === "horizontal";
  const originY = timeline.originY;
  const ticks = timeline.axisMap
    ? getTimelineAxisTicks(
        timeline.axisMap,
        horizontal ? viewport.left : top + 36 / scale,
        horizontal ? viewport.right : bottom,
        scale,
        timeline.tickInterval,
        timeline.clock,
        timeline.relativeTickStep,
      )
    : getVisibleTimeTicks(
        timeline.start,
        timeline.end,
        timeline.pixelsPerUnit,
        originY,
        top + 36 / scale,
        bottom,
        scale,
      );
  if (horizontal) {
    const rulerY = Math.max(timeline.axisX, top + 50 / scale);
    return (
      <g className="timeline-floating" pointerEvents="none" aria-hidden="true">
        {ticks.map((tick) => (
          <line
            key={tick.time}
            className="timeline-grid"
            x1={tick.y}
            x2={tick.y}
            y1={rulerY}
            y2={stage.stageHeight - 20}
          />
        ))}
        <rect
          className="timeline-ruler-bg"
          x={viewport.left}
          y={top}
          width={viewport.right - viewport.left}
          height={Math.max(0, rulerY - top)}
        />
        <line className="timeline-axis" x1={viewport.left} x2={viewport.right} y1={rulerY} y2={rulerY} />
        {ticks.map((tick) => (
          <g key={tick.time} transform={`translate(${tick.y},${rulerY - 8 / scale}) scale(${1 / scale})`}>
            <line className="timeline-axis" x1={0} x2={0} y1={3} y2={8} />
            <text className="timeline-axis-label" textAnchor="middle">
              {tick.label}
            </text>
          </g>
        ))}
        <text
          className="timeline-caption"
          transform={`translate(${viewport.left + 10 / scale},${top + 14 / scale}) scale(${1 / scale})`}
        >
          {caption} →
        </text>
        {timeline.tracks.map((track) => (
          <g
            key={track.id}
            transform={`translate(${viewport.left + 8 / scale},${track.x - 12 / scale}) scale(${1 / scale})`}
          >
            <text className="timeline-track-label">{track.label}</text>
          </g>
        ))}
      </g>
    );
  }
  return (
    <g className="timeline-floating" pointerEvents="none" aria-hidden="true">
      {ticks.map((tick) => (
        <line
          key={`grid:${tick.time}`}
          className="timeline-grid"
          x1={Math.max(x, timeline.axisX)}
          x2={stage.stageWidth - 20}
          y1={tick.y}
          y2={tick.y}
        />
      ))}
      <rect
        className="timeline-ruler-bg"
        x={x - 100 / scale}
        y={top}
        width={100 / scale}
        height={Math.max(0, bottom - top)}
      />
      <line className="timeline-axis" x1={x} x2={x} y1={top} y2={bottom} strokeWidth={1 / scale} />
      {ticks.map((tick) => (
        <g key={tick.time} transform={`translate(${x - 8 / scale},${tick.y}) scale(${1 / scale})`}>
          <line className="timeline-axis" x1={4} x2={8} y1={0} y2={0} />
          <text className="timeline-axis-label" textAnchor="end" y={4}>
            {tick.label}
          </text>
        </g>
      ))}
      <rect
        className="timeline-ruler-bg"
        x={x - 100 / scale}
        y={top}
        width={stage.stageWidth - x + 100 / scale}
        height={32 / scale}
      />
      <text
        className="timeline-caption"
        transform={`translate(${x - 8 / scale},${top + 21 / scale}) scale(${1 / scale})`}
        textAnchor="end"
      >
        {caption} ↓
      </text>
      {timeline.tracks.map((track) => (
        <g key={track.id} transform={`translate(${track.x + 10 / scale},${top + 21 / scale}) scale(${1 / scale})`}>
          <circle cx={3} cy={-4} r={3} fill={track.color} />
          <text className="timeline-track-label" x={12}>
            {track.label.length > Math.max(3, Math.floor((track.width * scale - 25) / 7))
              ? `${track.label.slice(0, Math.max(2, Math.floor((track.width * scale - 25) / 7) - 1))}…`
              : track.label}
          </text>
        </g>
      ))}
    </g>
  );
}
