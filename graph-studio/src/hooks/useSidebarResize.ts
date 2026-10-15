import { useCallback, useEffect, useRef } from "react";

export function useSidebarResize(width: number, onWidthChange: (width: number) => void) {
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  return useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    cleanup.current?.();
    const startX = event.clientX;
    const move = (next: PointerEvent) => onWidthChange(width + next.clientX - startX);
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
      window.removeEventListener("pointercancel", stop);
      window.removeEventListener("blur", stop);
      cleanup.current = null;
    };
    cleanup.current = stop;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
    window.addEventListener("pointercancel", stop);
    window.addEventListener("blur", stop);
  }, [width, onWidthChange]);
}
