import { useEffect, useRef, useState, type PointerEvent } from "react";

const STORAGE_KEY = "graph-studio.console-window.v1";
interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

function fit(bounds: Bounds): Bounds {
  const width = Math.min(Math.max(360, bounds.width), Math.max(1, window.innerWidth - 16));
  const height = Math.min(Math.max(280, bounds.height), Math.max(1, window.innerHeight - 16));
  return {
    width,
    height,
    x: Math.max(8, Math.min(bounds.x, window.innerWidth - width - 8)),
    y: Math.max(8, Math.min(bounds.y, window.innerHeight - height - 8)),
  };
}

function initialBounds(): Bounds {
  if (typeof window === "undefined") return { x: 8, y: 8, width: 680, height: 540 };
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "null");
    if (
      saved &&
      [saved.x, saved.y, saved.width, saved.height].every(
        (value) => typeof value === "number" && Number.isFinite(value),
      ) &&
      saved.width > 0 &&
      saved.height > 0
    )
      return fit(saved);
  } catch {
    /* Storage may be unavailable or contain an older invalid value. */
  }
  return fit({ x: (window.innerWidth - 680) / 2, y: (window.innerHeight - 540) / 2, width: 680, height: 540 });
}

export function useFloatingConsole() {
  const ref = useRef<HTMLElement>(null);
  const [bounds, setBounds] = useState(initialBounds);
  const drag = useRef<{ id: number; dx: number; dy: number }>();
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(bounds));
    } catch {
      /* Keep the window usable when persistence is blocked. */
    }
  }, [bounds]);
  useEffect(() => {
    const panel = ref.current;
    if (!panel) return;
    const clamp = () => {
      const measured = panel.getBoundingClientRect();
      setBounds((current) => {
        const next = fit({ ...current, width: measured.width, height: measured.height });
        return next.x === current.x &&
          next.y === current.y &&
          next.width === current.width &&
          next.height === current.height
          ? current
          : next;
      });
    };
    const observer = new ResizeObserver(clamp);
    observer.observe(panel);
    window.addEventListener("resize", clamp);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", clamp);
    };
  }, []);
  const onPointerDown = (event: PointerEvent<HTMLElement>) => {
    if (event.button !== 0 || (event.target as Element).closest("button")) return;
    const bounds = ref.current!.getBoundingClientRect();
    drag.current = { id: event.pointerId, dx: event.clientX - bounds.left, dy: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };
  const onPointerMove = (event: PointerEvent<HTMLElement>) => {
    if (drag.current?.id !== event.pointerId) return;
    const x = event.clientX - drag.current.dx,
      y = event.clientY - drag.current.dy;
    setBounds((current) => fit({ ...current, x, y }));
  };
  return {
    ref,
    style: { left: bounds.x, top: bounds.y, width: bounds.width, height: bounds.height },
    headerProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp: () => {
        drag.current = undefined;
      },
      onPointerCancel: () => {
        drag.current = undefined;
      },
      onLostPointerCapture: () => {
        drag.current = undefined;
      },
    },
  };
}
