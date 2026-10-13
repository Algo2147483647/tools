import { useLayoutEffect, useState, type RefObject } from "react";
import type { StageData } from "../layout/types";

const DAY = 86_400_000;

export default function TimelineBackdrop({ stage }: { stage: StageData }) {
  const timeline = stage.timeline!;
  return (
    <g className="timeline-backdrop" pointerEvents="none">
      {timeline.ticks.map((tick) => (
        <line
          key={tick.time}
          className="timeline-grid"
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
      const scale = rect.width / stage.stageWidth || 1;
      const overlays = container.closest(".workspace")?.querySelector(".workspace-overlays")?.getBoundingClientRect();
      const topbar = document.querySelector(".topbar")?.getBoundingClientRect();
      const safeLeft =
        overlays && overlays.width > 0 && overlays.width < box.width * 0.75
          ? Math.max(box.left, overlays.right + 6)
          : box.left;
      const safeTop = Math.max(box.top, (topbar?.bottom ?? box.top) + 4);
      setViewport({
        scale,
        x: Math.max(timeline.axisX, (safeLeft - rect.left + 100) / scale),
        top: Math.max(16, (safeTop - rect.top) / scale),
        bottom: Math.min(stage.stageHeight, (box.bottom - rect.top) / scale),
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
  const ticks = getVisibleTimeTicks(
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

export function getVisibleTimeTicks(
  start: number | null,
  end: number | null,
  pixelsPerMs: number,
  originY: number,
  top: number,
  bottom: number,
  scale: number,
): { time: number; y: number; label: string }[] {
  if (start === null || end === null || pixelsPerMs <= 0 || scale <= 0 || bottom <= top) return [];
  const minimumStep = 72 / (pixelsPerMs * scale);
  const steps = [
    1000,
    5000,
    15000,
    30000,
    60000,
    300000,
    900000,
    1800000,
    3600000,
    10800000,
    21600000,
    43200000,
    DAY,
    2 * DAY,
    7 * DAY,
    14 * DAY,
    30 * DAY,
    90 * DAY,
    180 * DAY,
    365.25 * DAY,
    2 * 365.25 * DAY,
    5 * 365.25 * DAY,
    10 * 365.25 * DAY,
    20 * 365.25 * DAY,
    50 * 365.25 * DAY,
    100 * 365.25 * DAY,
  ];
  const step = steps.find((value) => value >= minimumStep) ?? minimumStep;
  const first = Math.max(start, start + (top - originY) / pixelsPerMs);
  const last = Math.min(end, start + (bottom - originY) / pixelsPerMs);
  const result: { time: number; y: number; label: string }[] = [];
  // Calendar-aligned month/year ticks avoid drift across leap years.
  const months =
    step >= 30 * DAY
      ? step >= 365 * DAY
        ? Math.max(1, Math.round(step / (365.25 * DAY))) * 12
        : Math.round(step / (30 * DAY))
      : 0;
  let time: number;
  if (months) {
    const date = new Date(first);
    const month = date.getUTCFullYear() * 12 + date.getUTCMonth();
    const aligned = Math.floor(month / months) * months;
    time = calendarMonthStart(Math.floor(aligned / 12), aligned % 12);
  } else time = Math.ceil(first / step) * step;
  for (let count = 0; time <= last && count < 250; count++) {
    const iso = new Date(time).toISOString();
    if (time >= first)
      result.push({
        time,
        y: originY + (time - start) * pixelsPerMs,
        label:
          step >= 365 * DAY
            ? iso.slice(0, 4)
            : step >= 30 * DAY
              ? iso.slice(0, 7)
              : step >= DAY
                ? iso.slice(0, 10)
                : `${iso.slice(5, 10)} ${iso.slice(11, step < 60000 ? 19 : 16)}`,
      });
    if (months) {
      const date = new Date(time);
      time = calendarMonthStart(date.getUTCFullYear(), date.getUTCMonth() + months);
    } else time += step;
  }
  return result;
}

function calendarMonthStart(year: number, month: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, month, 1);
  date.setUTCHours(0, 0, 0, 0);
  return date.getTime();
}
