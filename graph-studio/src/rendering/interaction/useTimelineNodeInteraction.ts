import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import type { StageNode } from "../../layout/shared/types";
export function useTimelineNodeInteraction({
  node,
  canPin,
  horizontal,
  cross,
  minimumCross,
  onPin,
  onClick: select,
  onDoubleClick,
}: {
  node: StageNode;
  canPin: boolean;
  horizontal: boolean;
  cross: number;
  minimumCross: number;
  onPin?: (key: string, x: number) => void;
  onClick: (key: string) => void;
  onDoubleClick?: (key: string) => void;
}) {
  const drag = useRef<{ clientX: number; scale: number; delta: number } | null>(null);
  const dragged = useRef(false);
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
      else select(node.key);
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
  const onPointerDown = (event: PointerEvent<SVGGElement>) => {
    if (!canPin || event.button !== 0) return;
    const scale = event.currentTarget.ownerSVGElement?.getScreenCTM()?.a || 1;
    drag.current = { clientX: horizontal ? event.clientY : event.clientX, scale, delta: 0 };
    dragged.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const onPointerMove = (event: PointerEvent<SVGGElement>) => {
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
  };
  const onPointerUp = (event: PointerEvent<SVGGElement>) => {
    const delta = drag.current?.delta ?? 0;
    drag.current = null;
    preview(event.currentTarget);
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    if (dragged.current) onPin?.(node.key, cross + delta);
  };
  const onPointerCancel = (event: PointerEvent<SVGGElement>) => {
    drag.current = null;
    dragged.current = false;
    preview(event.currentTarget);
  };
  const onClick = () => {
    if (!dragged.current) select(node.key);
    dragged.current = false;
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, onClick, onKeyDown: handleKeyDown };
}
