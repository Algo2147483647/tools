import { useEffect, useRef } from "react";

interface UseGraphPanInput {
  containerRef: React.RefObject<HTMLElement>;
  enabled: boolean;
  onPanStart?: () => void;
  onPanEnd?: () => void;
}

export function useGraphPan({ containerRef, enabled, onPanStart, onPanEnd }: UseGraphPanInput): void {
  const panState = useRef({ active: false, moved: false, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) {
      return;
    }

    function handleMouseDown(event: MouseEvent) {
      panState.current.moved = false;
      if (
        event.button !== 0 ||
        (event.target instanceof Element && event.target.closest(".dag-node, .dag-group-controls"))
      ) {
        return;
      }
      panState.current = {
        active: true,
        moved: false,
        startX: event.clientX,
        startY: event.clientY,
        scrollLeft: container!.scrollLeft,
        scrollTop: container!.scrollTop,
      };
      document.body.classList.add("graph-is-panning");
      onPanStart?.();
    }

    function handleMouseMove(event: MouseEvent) {
      if (!panState.current.active) {
        return;
      }
      event.preventDefault();
      const deltaX = event.clientX - panState.current.startX;
      const deltaY = event.clientY - panState.current.startY;
      if (Math.hypot(deltaX, deltaY) > 3) panState.current.moved = true;
      container!.scrollLeft = panState.current.scrollLeft - deltaX;
      container!.scrollTop = panState.current.scrollTop - deltaY;
    }

    function stopPan() {
      if (!panState.current.active) {
        return;
      }
      panState.current.active = false;
      document.body.classList.remove("graph-is-panning");
      onPanEnd?.();
    }

    function suppressDragClick(event: MouseEvent) {
      if (!panState.current.moved) return;
      panState.current.moved = false;
      event.preventDefault();
      event.stopPropagation();
    }

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("click", suppressDragClick, true);
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", stopPan);
    window.addEventListener("blur", stopPan);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("click", suppressDragClick, true);
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", stopPan);
      window.removeEventListener("blur", stopPan);
      document.body.classList.remove("graph-is-panning");
    };
  }, [containerRef, enabled, onPanEnd, onPanStart]);
}
