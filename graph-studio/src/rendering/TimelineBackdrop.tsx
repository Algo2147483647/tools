import { useLayoutEffect, useState, type RefObject } from "react";
import type { StageData } from "../layout/types";

import { getTimelineAxisTicks, getVisibleTimeTicks } from "../layout/timeline-ticks";
export { getVisibleTimeTicks } from "../layout/timeline-ticks";

export default function TimelineBackdrop({ stage }: { stage: StageData }) {
  const timeline = stage.timeline!;
  return (
    <g className="timeline-backdrop" pointerEvents="none">
      {timeline.ticks.map((tick) => (
        <line
          key={tick.time}
          className="timeline-grid timeline-export-static"
          x1={timeline.axisX}
          x2={stage.stageWidth - 20}
          y1={tick.y}
          y2={tick.y}
        />
      ))}
      {timeline.tracks.map((track) => (
        <line
          key={track.id}
          className="timeline-track-guide"
          x1={track.x}
          x2={track.x}
          y1={70}
          y2={stage.stageHeight - 28}
        />
      ))}
      {timeline.undatedY !== null && (
        <g>
          <line
            className="timeline-axis"
            x1={timeline.axisX}
            x2={stage.stageWidth - 20}
            y1={timeline.undatedY - 22}
            y2={timeline.undatedY - 22}
          />
          <text className="timeline-caption" x={timeline.axisX + 12} y={timeline.undatedY - 28}>
            UNPLACED EVENTS · missing or invalid time
          </text>
        </g>
      )}
      <g className="timeline-export-static">
        <line className="timeline-axis" x1={timeline.axisX} x2={timeline.axisX} y1={55} y2={stage.stageHeight - 25} />
        <text className="timeline-caption" x={timeline.axisX - 8} y={32} textAnchor="end">
          TIME · UTC ↓
        </text>
        {timeline.ticks.map((tick) => (
          <text key={tick.time} className="timeline-axis-label" x={timeline.axisX - 8} y={tick.y + 4} textAnchor="end">
            {tick.label}
          </text>
        ))}
        {timeline.tracks.map((track) => (
          <text key={track.id} className="timeline-track-label" x={track.x + 12} y={32}>
            {track.label}
          </text>
        ))}
      </g>
    </g>
  );
}

export function TimelineRuler({ stage, svgRef }: { stage: StageData; svgRef: RefObject<SVGSVGElement> }) {
  const timeline = stage.timeline!;
  const [viewport, setViewport] = useState({
    scale: 1,
    x: timeline.axisX,
    top: 16,
    bottom: stage.stageHeight,
    width: stage.stageWidth,
  });
  useLayoutEffect(() => {
    const svg = svgRef.current;
    const container = svg?.parentElement;
    if (!svg || !container) return;
    let frame = 0;
    function measure() {
      frame = 0;
      if (!svg || !container) return;
      const rect = svg.getBoundingClientRect();
      const box = container.getBoundingClientRect();
      const viewBox = svg.viewBox.baseVal;
      const scale = rect.width / (viewBox.width || stage.stageWidth) || 1;
      const overlays = container.closest(".workspace")?.querySelector(".workspace-overlays")?.getBoundingClientRect();
      const topbar = svg.ownerDocument.querySelector(".topbar")?.getBoundingClientRect();
      const safeLeft =
        overlays && overlays.width > 0 && overlays.width < box.width * 0.75
          ? Math.max(box.left, overlays.right + 6)
          : box.left;
      const safeTop = Math.max(box.top, (topbar?.bottom ?? box.top) + 4);
      setViewport({
        scale,
        x: Math.max(timeline.axisX, viewBox.x + (safeLeft - rect.left + 100) / scale),
        top: Math.max(16, viewBox.y + (safeTop - rect.top) / scale),
        bottom: Math.min(stage.stageHeight, viewBox.y + (box.bottom - rect.top) / scale),
        width: box.width / scale,
      });
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(svg);
    observer.observe(container);
    const overlays = container.closest(".workspace")?.querySelector(".workspace-overlays");
    if (overlays) observer.observe(overlays);
    container.addEventListener("scroll", schedule, { passive: true });
    measure();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      container.removeEventListener("scroll", schedule);
    };
  }, [stage, svgRef, timeline.axisX]);
  const { scale, x, top, bottom } = viewport;
  const originY = timeline.originY;
  const ticks = timeline.axisMap
    ? getTimelineAxisTicks(timeline.axisMap, top + 36 / scale, bottom, scale, timeline.tickInterval)
    : getVisibleTimeTicks(
        timeline.start,
        timeline.end,
        timeline.pixelsPerMillisecond,
        originY,
        top + 36 / scale,
        bottom,
        scale,
      );
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
        UTC ↓
      </text>
      {timeline.tracks.map((track) => (
        <g key={track.id} transform={`translate(${track.x + 10},${top + 21 / scale}) scale(${1 / scale})`}>
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
