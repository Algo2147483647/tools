import { timelineBarBox, timelinePoint } from "../layout/timeline-orientation";
import { useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { StageNode } from "../layout/types";

interface TimelineNodeProps {
  layer?: "leader" | "marker" | "label" | "all";
  node: StageNode;
  isActive: boolean;
  onPin?: (key: string, x: number) => void;
  onClick: (key: string) => void;
  onDoubleClick?: (key: string) => void;
  onContextMenu: (event: ReactMouseEvent<SVGGElement>, key: string) => void;
  onFocusChange: (key: string | null) => void;
}

export default function TimelineNode({
  layer = "all",
  node,
  isActive,
  onPin,
  onClick,
  onDoubleClick,
  onContextMenu,
  onFocusChange,
}: TimelineNodeProps) {
  const drag = useRef<{ clientX: number; scale: number; delta: number } | null>(null);
  const dragged = useRef(false);
  const time = node.timeline!;
  const { startY, endY, labelX, labelY, anchorY } = time;
  const range = time.kind === "range";
  const horizontal = time.orientation === "horizontal";
  const inside = range && time.intervalTitle === "inside";
  const external = !range || !time.intervalTitle || time.intervalTitle === "outside";
  const bar = timelineBarBox(node);
  const start = timelinePoint(node, startY),
    end = timelinePoint(node, endY);
  const anchor = timelinePoint(node, anchorY);
  const clipId = `timeline-title-${useId().replace(/:/g, "")}`;
  const align = time.intervalAlign ?? "center";
  const titleX = horizontal
    ? align === "start"
      ? bar.x + 8
      : align === "end"
        ? bar.x + bar.width - 8
        : bar.x + bar.width / 2
    : node.x;
  const titleY = horizontal
    ? node.y
    : align === "start"
      ? bar.y + 16
      : align === "end"
        ? bar.y + bar.height - 16
        : bar.y + bar.height / 2;
  const cross = horizontal ? node.y : node.x;
  const minimumCross = time.minimumCross ?? 214;
  const canPin = Boolean(onPin) && time.space === undefined;
  const dateLimit = Math.max(16, Math.floor(node.width / 6.1));
  const dateLabel = time.label.length > dateLimit ? `${time.label.slice(0, dateLimit - 1)}…` : time.label;
  const labelEdgeX = Math.max(labelX - 7, Math.min(anchor.x, labelX + node.width + 7));
  const labelEdgeY = Math.max(labelY - 17, Math.min(anchor.y, labelY + (node.detailLines.length ? 40 : 25)));
  const leader = `M ${anchor.x} ${anchor.y} L ${labelEdgeX} ${labelEdgeY}`;
  function preview(element: SVGGElement, delta?: number) {
    element.ownerSVGElement?.querySelectorAll<SVGGElement>(".timeline-node").forEach((part) => {
      if (part.dataset.key !== node.key) return;
      if (delta === undefined) part.removeAttribute("transform");
      else part.setAttribute("transform", horizontal ? `translate(0,${delta})` : `translate(${delta},0)`);
    });
  }
  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (
      canPin &&
      event.altKey &&
      (horizontal ? ["ArrowUp", "ArrowDown"] : ["ArrowLeft", "ArrowRight"]).includes(event.key)
    ) {
      event.preventDefault();
      onPin!(node.key, Math.max(minimumCross, cross + (["ArrowLeft", "ArrowUp"].includes(event.key) ? -16 : 16)));
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (event.key === "Enter" && onDoubleClick) onDoubleClick(node.key);
      else onClick(node.key);
    } else if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      event.currentTarget.dispatchEvent(
        new MouseEvent("contextmenu", {
          bubbles: true,
          clientX: rect.left + rect.width / 2,
          clientY: rect.top + rect.height / 2,
        }),
      );
    }
  }
  return (
    <g
      className="dag-node timeline-node"
      data-key={node.key}
      data-timeline-layer={layer}
      data-type={node.typeLabel || ""}
      data-selected={isActive ? "true" : "false"}
      data-focused="false"
      data-hovered="false"
      data-connected="false"
      data-time-kind={time.kind}
      data-interval-style={time.intervalStyle ?? "soft"}
      data-time-status={time.status}
      data-track={time.track}
      data-clipped-start={time.clippedStart || undefined}
      data-clipped-end={time.clippedEnd || undefined}
      style={{ "--dag-timeline-color": time.color } as CSSProperties}
      tabIndex={layer === "leader" ? undefined : layer === "marker" ? -1 : 0}
      role={layer === "marker" || layer === "leader" ? undefined : "button"}
      aria-hidden={layer === "marker" || layer === "leader" || undefined}
      aria-label={`${node.title}. ${time.label}${time.warning ? `. ${time.warning}` : ""}. Select event; press Enter or double-click for details.`}
      onPointerDown={(event) => {
        if (!canPin || event.button !== 0) return;
        const scale = event.currentTarget.ownerSVGElement?.getScreenCTM()?.a || 1;
        drag.current = { clientX: horizontal ? event.clientY : event.clientX, scale, delta: 0 };
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        drag.current.delta = Math.max(
          minimumCross - cross,
          ((horizontal ? event.clientY : event.clientX) - drag.current.clientX) / drag.current.scale,
        );
        if (Math.abs((horizontal ? event.clientY : event.clientX) - drag.current.clientX) > 4) dragged.current = true;
        if (dragged.current) {
          event.preventDefault();
          preview(event.currentTarget, drag.current.delta);
        }
      }}
      onPointerUp={(event) => {
        const delta = drag.current?.delta ?? 0;
        drag.current = null;
        preview(event.currentTarget);
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        if (dragged.current) onPin?.(node.key, cross + delta);
      }}
      onPointerCancel={(event) => {
        drag.current = null;
        dragged.current = false;
        preview(event.currentTarget);
      }}
      onClick={() => {
        if (!dragged.current) onClick(node.key);
        dragged.current = false;
      }}
      onDoubleClick={() => onDoubleClick?.(node.key)}
      onContextMenu={(event) => onContextMenu(event, node.key)}
      onFocus={() => onFocusChange(node.key)}
      onKeyDown={handleKeyDown}
    >
      <title>
        {[
          node.title,
          time.label,
          time.track,
          time.clippedStart ? "Starts before the displayed range" : "",
          time.clippedEnd ? "Continues after the displayed range" : "",
          node.detail,
          time.warning,
        ]
          .filter(Boolean)
          .join("\n")}
      </title>
      {external && (layer === "leader" || layer === "all") && <path className="timeline-node__leader" d={leader} />}
      {(layer === "marker" || layer === "all") && (
        <>
          <rect
            className="timeline-node__hit"
            x={range ? bar.x - 6 : start.x - 12}
            y={range ? bar.y - 6 : start.y - 12}
            width={range ? bar.width + 12 : 24}
            height={range ? bar.height + 12 : 24}
            rx={8}
          />
          {range ? (
            <>
              <rect className="timeline-node__duration" {...bar} rx={Math.min(6, bar.width / 2, bar.height / 2)} />
              {time.clippedStart ? (
                <path
                  className="timeline-node__open"
                  d={
                    horizontal
                      ? `M${start.x + 6},${start.y - 6} L${start.x},${start.y} L${start.x + 6},${start.y + 6}`
                      : `M${start.x - 6},${start.y + 6} L${start.x},${start.y} L${start.x + 6},${start.y + 6}`
                  }
                />
              ) : (
                <circle className="timeline-node__point" cx={start.x} cy={start.y} r={4} />
              )}
              {time.ongoing || time.clippedEnd ? (
                <path
                  className="timeline-node__open"
                  d={
                    horizontal
                      ? `M${end.x - 6},${end.y - 6} L${end.x},${end.y} L${end.x - 6},${end.y + 6}`
                      : `M${end.x - 6},${end.y - 6} L${end.x},${end.y} L${end.x + 6},${end.y - 6}`
                  }
                />
              ) : (
                <line
                  className="timeline-node__cap"
                  x1={end.x - (horizontal ? 0 : 7)}
                  x2={end.x + (horizontal ? 0 : 7)}
                  y1={end.y - (horizontal ? 7 : 0)}
                  y2={end.y + (horizontal ? 7 : 0)}
                />
              )}
            </>
          ) : time.status === "dated" ? (
            <circle className="timeline-node__point" cx={start.x} cy={start.y} r={6} />
          ) : (
            <path className="timeline-node__unknown" d={`M${start.x},${start.y - 7} l7,7 -7,7 -7,-7 z`} />
          )}
          {time.ports?.map((port) => {
            const p = timelinePoint(node, port.y);
            return (
              <circle key={port.time} className="timeline-node__point" cx={p.x} cy={p.y} r={4} aria-hidden="true" />
            );
          })}
        </>
      )}
      {external && (layer === "label" || layer === "all") && (
        <>
          <rect
            className="timeline-node__label-bg"
            x={labelX - 6}
            y={labelY - 16}
            width={node.width + 12}
            height={node.detailLines.length ? 55 : 40}
            rx={7}
          />
          <text className="timeline-node__title" x={labelX} y={labelY}>
            {node.displayTitle}
          </text>
          <text className="timeline-node__date" x={labelX} y={labelY + 17}>
            {dateLabel}
          </text>
          {node.detailLines.length > 0 && (
            <text className="timeline-node__detail" x={labelX} y={labelY + 32}>
              {node.detailLines[0]}
            </text>
          )}
        </>
      )}
      {inside && (layer === "label" || layer === "all") && (
        <>
          <defs>
            <clipPath id={clipId}>
              <rect
                x={bar.x + 4}
                y={bar.y + 2}
                width={Math.max(0, bar.width - 8)}
                height={Math.max(0, bar.height - 4)}
              />
            </clipPath>
          </defs>
          <rect className="timeline-node__hit" {...bar} rx={6} />
          <text
            className="timeline-node__title timeline-node__inside-title"
            x={titleX}
            y={titleY}
            dominantBaseline="central"
            textAnchor={horizontal ? (align === "start" ? "start" : align === "end" ? "end" : "middle") : "middle"}
            clipPath={`url(#${clipId})`}
          >
            {node.displayTitle}
          </text>
        </>
      )}
    </g>
  );
}
