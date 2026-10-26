import { useEffect, useRef, type MouseEvent } from "react";

// A native dblclick only covers the primary button. Delay the first context
// menu so it cannot intercept the second right click on the canvas.
export function useConsoleGesture(open: () => void, scope: unknown) {
  const pending = useRef<{ timer: number; x: number; y: number; time: number }>();
  const cancel = () => {
    if (pending.current) window.clearTimeout(pending.current.timer);
    pending.current = undefined;
  };
  useEffect(() => {
    const pointer = (event: PointerEvent) => {
      if (event.button !== 2) cancel();
    };
    const key = () => cancel();
    window.addEventListener("pointerdown", pointer);
    window.addEventListener("keydown", key);
    window.addEventListener("blur", cancel);
    return () => {
      cancel();
      window.removeEventListener("pointerdown", pointer);
      window.removeEventListener("keydown", key);
      window.removeEventListener("blur", cancel);
    };
  }, [scope]);

  return (event: MouseEvent<Element>, showMenu: () => void) => {
    event.preventDefault();
    event.stopPropagation();
    // Keep keyboard context menus and touch long presses immediate.
    if (event.button !== 2) {
      cancel();
      showMenu();
      return;
    }
    const previous = pending.current;
    cancel();
    if (
      previous &&
      event.timeStamp - previous.time <= 400 &&
      Math.hypot(event.clientX - previous.x, event.clientY - previous.y) <= 12
    ) {
      open();
      return;
    }
    pending.current = {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      timer: window.setTimeout(() => {
        pending.current = undefined;
        showMenu();
      }, 400),
    };
  };
}
