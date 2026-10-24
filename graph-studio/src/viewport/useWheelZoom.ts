import { useEffect, useRef } from "react";
import type { StageData } from "../layout/types";
import { clamp, ZOOM_STEP_FACTOR, type ZoomAnchor } from "./zoomGeometry";

const WHEEL_ZOOM_SENSITIVITY = Math.log(ZOOM_STEP_FACTOR) / 120;
const TRACKPAD_PIXEL_DELTA_THRESHOLD = 60;
const TRACKPAD_PIXEL_ZOOM_MULTIPLIER = 6;
const MAX_WHEEL_DELTA = 360;

export function useWheelZoom(
  containerRef: React.RefObject<HTMLElement>,
  stage: StageData | null,
  zoomBy: (factor: number, anchor?: ZoomAnchor) => void,
) {
  const wheelZoomRef = useRef<{ frame: number; deltaY: number; anchor: ZoomAnchor | null }>({
    frame: 0,
    deltaY: 0,
    anchor: null,
  });
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !stage) {
      return;
    }

    function handleWheel(event: WheelEvent) {
      if (stage?.layoutMode !== "spatial" && !event.ctrlKey && !event.metaKey) {
        return;
      }
      event.preventDefault();
      wheelZoomRef.current.deltaY += clamp(getWheelZoomDelta(event), -MAX_WHEEL_DELTA, MAX_WHEEL_DELTA);
      wheelZoomRef.current.anchor = { clientX: event.clientX, clientY: event.clientY };
      if (wheelZoomRef.current.frame) {
        return;
      }
      wheelZoomRef.current.frame = window.requestAnimationFrame(() => {
        const { deltaY, anchor } = wheelZoomRef.current;
        wheelZoomRef.current = { frame: 0, deltaY: 0, anchor: null };
        if (!anchor || Math.abs(deltaY) < 0.01) {
          return;
        }
        const factor = Math.exp(-deltaY * WHEEL_ZOOM_SENSITIVITY);
        zoomBy(factor, anchor);
      });
    }

    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => {
      container.removeEventListener("wheel", handleWheel);
      if (wheelZoomRef.current.frame) {
        window.cancelAnimationFrame(wheelZoomRef.current.frame);
        wheelZoomRef.current = { frame: 0, deltaY: 0, anchor: null };
      }
    };
  }, [containerRef, stage, zoomBy]);
}

function getWheelZoomDelta(event: WheelEvent): number {
  if (event.deltaMode !== WheelEvent.DOM_DELTA_PIXEL) {
    return event.deltaY;
  }

  const absDeltaY = Math.abs(event.deltaY);
  if (absDeltaY > 0 && absDeltaY < TRACKPAD_PIXEL_DELTA_THRESHOLD) {
    return event.deltaY * TRACKPAD_PIXEL_ZOOM_MULTIPLIER;
  }
  return event.deltaY;
}
