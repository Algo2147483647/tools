import type { CSSProperties } from "react";
import type { TimelineMarkerSettings } from "../../schema/appearance/types";

export function timelineMarkerStyle(settings: TimelineMarkerSettings): CSSProperties {
  return {
    "--timeline-marker-fill": settings.fill || "var(--dag-timeline-color)",
    "--timeline-marker-border": settings.borderColor || "var(--dag-node-fill)",
    "--timeline-marker-stroke": settings.borderWidth,
  } as CSSProperties;
}

export default function TimelineMarker({
  x,
  y,
  settings,
  anchor = false,
  end = false,
  horizontal = false,
}: {
  x: number;
  y: number;
  settings: TimelineMarkerSettings;
  anchor?: boolean;
  end?: boolean;
  horizontal?: boolean;
}) {
  if (!settings.visible || settings.size === 0) return null;
  const r = settings.size / 2;
  const common = {
    className: `timeline-node__point ${anchor ? "timeline-node__anchor" : "timeline-node__instant"}`,
    style: timelineMarkerStyle(settings),
    "aria-hidden": true as const,
  };
  if (settings.shape === "auto" && end) {
    const radius = r * 1.75;
    return (
      <line
        {...common}
        className="timeline-node__cap timeline-node__anchor"
        x1={x - (horizontal ? 0 : radius)}
        x2={x + (horizontal ? 0 : radius)}
        y1={y - (horizontal ? radius : 0)}
        y2={y + (horizontal ? radius : 0)}
      />
    );
  }
  if (settings.shape === "square")
    return <rect {...common} x={x - r} y={y - r} width={settings.size} height={settings.size} />;
  if (settings.shape === "diamond")
    return <path {...common} d={`M ${x} ${y - r} L ${x + r} ${y} L ${x} ${y + r} L ${x - r} ${y} Z`} />;
  return <circle {...common} cx={x} cy={y} r={r} />;
}
