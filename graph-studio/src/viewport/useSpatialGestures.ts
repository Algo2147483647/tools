import { composeOrientation, trackballRotation, type Quaternion } from "./camera/quaternion";
import { useEffect, useRef } from "react";

interface SpatialGestures {
  containerRef: React.RefObject<HTMLElement>;
  enabled: boolean;
  canOrbit: boolean;
  viewKey: string;
  onOrbit(rotation: Quaternion): void;
  onPan(dx: number, dy: number): void;
  onZoom(factor: number, anchor: { clientX: number; clientY: number }): void;
}

/** One pointer rotates a 3D view; two pointers manipulate the screen-space camera. */
export function useSpatialGestures(input: SpatialGestures) {
  const callbacks = useRef(input);
  callbacks.current = input;
  const { containerRef, enabled, canOrbit, viewKey } = input;
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !enabled) return;
    type Pointer = { x: number; y: number; startX: number; startY: number; pan: boolean };
    const pointers = new Map<number, Pointer>();
    let moved = false;
    let multiple = false;
    let suppressUntil = 0;
    let frame = 0;
    let rotation: Quaternion | null = null;

    function flushOrbit() {
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      if (rotation) callbacks.current.onOrbit(rotation);
      rotation = null;
    }
    function capture(id: number) {
      if (container!.hasPointerCapture(id)) return;
      try {
        container!.setPointerCapture(id);
      } catch {
        // A pointer can end before a coalesced move is delivered.
      }
    }
    function down(event: PointerEvent) {
      if (
        event.button > 2 ||
        (event.target instanceof Element && event.target.closest("button, a, input, select, textarea"))
      )
        return;
      if (!pointers.size) {
        moved = multiple = false;
        suppressUntil = 0;
      }
      pointers.set(event.pointerId, {
        x: event.clientX,
        y: event.clientY,
        startX: event.clientX,
        startY: event.clientY,
        pan: event.button === 1 || event.button === 2 || event.shiftKey || event.ctrlKey || event.metaKey,
      });
      if (pointers.size > 1) {
        flushOrbit();
        multiple = moved = true;
        container!.dataset.gesturing = "true";
        for (const id of pointers.keys()) capture(id);
      }
      // Prevent middle-button auto-scroll. Keep taps/clicks available on nodes.
      if (event.button === 1) event.preventDefault();
    }
    function move(event: PointerEvent) {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      const previous = [...pointers.values()].slice(0, 2).map((p) => ({ ...p }));
      const dx = event.clientX - pointer.x,
        dy = event.clientY - pointer.y;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!moved && Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < 4) return;
      moved = true;
      event.preventDefault();
      container!.dataset.gesturing = "true";
      capture(event.pointerId);
      if (pointers.size >= 2) {
        const current = [...pointers.values()].slice(0, 2);
        const before = { clientX: (previous[0].x + previous[1].x) / 2, clientY: (previous[0].y + previous[1].y) / 2 };
        const after = { clientX: (current[0].x + current[1].x) / 2, clientY: (current[0].y + current[1].y) / 2 };
        const distance = Math.hypot(previous[1].x - previous[0].x, previous[1].y - previous[0].y);
        const nextDistance = Math.hypot(current[1].x - current[0].x, current[1].y - current[0].y);
        if (distance > 1 && nextDistance > 1) callbacks.current.onZoom(nextDistance / distance, before);
        callbacks.current.onPan(after.clientX - before.clientX, after.clientY - before.clientY);
      } else if (!canOrbit || pointer.pan || multiple) {
        callbacks.current.onPan(dx, dy);
      } else {
        const rect = container!.getBoundingClientRect();
        const radius = Math.max(1, Math.min(rect.width, rect.height) / 2);
        const point = (x: number, y: number): [number, number] => [
          (x - rect.left - rect.width / 2) / radius,
          (rect.top + rect.height / 2 - y) / radius,
        ];
        const delta = trackballRotation(
          point(event.clientX - dx, event.clientY - dy),
          point(event.clientX, event.clientY),
        );
        rotation = rotation ? composeOrientation(delta, rotation) : delta;
        if (!frame) frame = requestAnimationFrame(flushOrbit);
      }
    }
    function up(event: PointerEvent) {
      if (!pointers.delete(event.pointerId)) return;
      if (moved) suppressUntil = performance.now() + 500;
      if (!pointers.size) {
        flushOrbit();
        delete container!.dataset.gesturing;
      }
      if (container!.hasPointerCapture(event.pointerId)) container!.releasePointerCapture(event.pointerId);
    }
    function cancel() {
      if (moved) suppressUntil = performance.now() + 500;
      const captured = [...pointers.keys()];
      pointers.clear();
      if (frame) cancelAnimationFrame(frame);
      frame = 0;
      rotation = null;
      delete container!.dataset.gesturing;
      for (const id of captured) if (container!.hasPointerCapture(id)) container!.releasePointerCapture(id);
    }
    function lostCapture(event: PointerEvent) {
      if (event.target === container && pointers.has(event.pointerId)) cancel();
    }
    function suppressClick(event: MouseEvent) {
      if (performance.now() < suppressUntil || (pointers.size && moved)) {
        event.preventDefault();
        event.stopPropagation();
      }
    }
    container.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    container.addEventListener("lostpointercapture", lostCapture);
    for (const type of ["click", "dblclick", "contextmenu"] as const)
      container.addEventListener(type, suppressClick, true);
    return () => {
      cancel();
      container.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      container.removeEventListener("lostpointercapture", lostCapture);
      for (const type of ["click", "dblclick", "contextmenu"] as const)
        container.removeEventListener(type, suppressClick, true);
    };
  }, [containerRef, enabled, canOrbit, viewKey]);
}
