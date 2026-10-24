import { sanitizeTimelineClock,timelineClockCaption } from "../graph/timeline/clock";
import type { StageData } from "../layout/shared/types";


export default function TimelineBackdrop({ stage }: { stage: StageData }) {
  const timeline = stage.timeline!;
  const caption = timelineClockCaption(timeline.clock ?? sanitizeTimelineClock(null));
  if (timeline.orientation === "horizontal") return <HorizontalBackdrop stage={stage} />;
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
          TIME · {caption} ↓
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



function HorizontalBackdrop({ stage }: { stage: StageData }) {
  const t = stage.timeline!;
  const caption = timelineClockCaption(t.clock ?? sanitizeTimelineClock(null));
  return (
    <g className="timeline-backdrop" pointerEvents="none">
      {t.ticks.map((tick) => (
        <line
          key={tick.time}
          className="timeline-grid timeline-export-static"
          x1={tick.y}
          x2={tick.y}
          y1={t.axisX}
          y2={stage.stageHeight - 20}
        />
      ))}
      {t.tracks.map((track) => (
        <line
          key={track.id}
          className="timeline-track-guide"
          x1={70}
          x2={stage.stageWidth - 28}
          y1={track.x}
          y2={track.x}
        />
      ))}
      {t.undatedY !== null && (
        <g>
          <line
            className="timeline-axis"
            x1={t.undatedY - 22}
            x2={t.undatedY - 22}
            y1={t.axisX}
            y2={stage.stageHeight - 20}
          />
          <text className="timeline-caption" x={t.undatedY} y={t.axisX - 35}>
            UNPLACED EVENTS
          </text>
        </g>
      )}
      <g className="timeline-export-static">
        <line className="timeline-axis" x1={55} x2={stage.stageWidth - 25} y1={t.axisX} y2={t.axisX} />
        <text className="timeline-caption" x={55} y={t.axisX - 35}>
          TIME · {caption} →
        </text>
        {t.ticks.map((tick) => (
          <text key={tick.time} className="timeline-axis-label" x={tick.y} y={t.axisX - 8} textAnchor="middle">
            {tick.label}
          </text>
        ))}
        {t.tracks.map((track) => (
          <text key={track.id} className="timeline-track-label" x={32} y={track.x - 12}>
            {track.label}
          </text>
        ))}
      </g>
    </g>
  );
}
