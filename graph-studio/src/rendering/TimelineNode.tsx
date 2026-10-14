import { useRef, type CSSProperties, type KeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import type { StageNode } from "../layout/types";
import { roundedTimelinePath } from "../layout/timeline-routing";

interface TimelineNodeProps {
  layer?: "marker" | "label" | "all";
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
  const barHeight = Math.max(2, endY - startY);
  const dateLimit = Math.max(16, Math.floor(node.width / 6.1));
  const dateLabel = time.label.length > dateLimit ? `${time.label.slice(0, dateLimit - 1)}…` : time.label;
  const labelEdgeX = labelX >= node.x ? labelX - 7 : labelX + node.width + 7;
  const elbowX = node.x + (labelEdgeX - node.x) / 2;
  const leader = roundedTimelinePath([
    { x: node.x, y: anchorY },
    { x: elbowX, y: anchorY },
    { x: elbowX, y: labelY - 3 },
    { x: labelEdgeX, y: labelY - 3 },
  ]);
  function preview(element: SVGGElement, delta?: number) {
    element.ownerSVGElement?.querySelectorAll<SVGGElement>(".timeline-node").forEach((part) => {
      if (part.dataset.key !== node.key) return;
      if (delta === undefined) part.removeAttribute("transform");
      else part.setAttribute("transform", `translate(${delta},0)`);
    });
  }
  function handleKeyDown(event: KeyboardEvent<SVGGElement>) {
    if (onPin && event.altKey && ["ArrowLeft", "ArrowRight"].includes(event.key)) {
      event.preventDefault();
      onPin(node.key, Math.max(214, node.x + (event.key === "ArrowLeft" ? -16 : 16)));
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
      data-time-status={time.status}
      data-track={time.track}
      data-clipped-start={time.clippedStart || undefined}
      data-clipped-end={time.clippedEnd || undefined}
      style={{ "--dag-timeline-color": time.color } as CSSProperties}
      tabIndex={layer === "marker" ? -1 : 0}
      role={layer === "marker" ? undefined : "button"}
      aria-hidden={layer === "marker" || undefined}
      aria-label={`${node.title}. ${time.label}${time.warning ? `. ${time.warning}` : ""}. Select event; press Enter or double-click for details.`}
      onPointerDown={(event) => {
        if (!onPin || event.button !== 0) return;
        const scale = event.currentTarget.ownerSVGElement?.getScreenCTM()?.a || 1;
        drag.current = { clientX: event.clientX, scale, delta: 0 };
        dragged.current = false;
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (!drag.current) return;
        drag.current.delta = Math.max(214 - node.x, (event.clientX - drag.current.clientX) / drag.current.scale);
        if (Math.abs(event.clientX - drag.current.clientX) > 4) dragged.current = true;
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
        if (dragged.current) onPin?.(node.key, node.x + delta);
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
      {layer !== "label" && (
        <>
          <path className="timeline-node__leader" d={leader} />
          <rect
            className="timeline-node__hit"
            x={node.x - 12}
            y={startY - 10}
            width={24}
            height={range ? barHeight + 20 : 24}
            rx={8}
          />
          {range ? (
            <>
              <rect
                className="timeline-node__duration"
                x={node.x - 6}
                y={startY}
                width={12}
                height={barHeight}
                rx={Math.min(6, barHeight / 2)}
              />
              {time.clippedStart ? (
                <path
                  className="timeline-node__open"
                  d={`M${node.x - 6},${startY + 6} L${node.x},${startY} L${node.x + 6},${startY + 6}`}
                />
              ) : (
                <circle className="timeline-node__point" cx={node.x} cy={startY} r={4} />
              )}
              {time.ongoing || time.clippedEnd ? (
                <path
                  className="timeline-node__open"
                  d={`M${node.x - 6},${endY - 6} L${node.x},${endY} L${node.x + 6},${endY - 6}`}
                />
              ) : (
                <line className="timeline-node__cap" x1={node.x - 7} x2={node.x + 7} y1={endY} y2={endY} />
              )}
            </>
          ) : time.status === "dated" ? (
            <circle className="timeline-node__point" cx={node.x} cy={startY} r={6} />
          ) : (
            <path className="timeline-node__unknown" d={`M${node.x},${startY - 7} l7,7 -7,7 -7,-7 z`} />
          )}
          {time.ports?.map((port) => (
            <circle key={port.time} className="timeline-node__point" cx={node.x} cy={port.y} r={4} aria-hidden="true" />
          ))}
        </>
      )}
      {layer !== "marker" && (
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
    </g>
  );
}
