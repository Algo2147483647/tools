import { documentViewIdentity } from "../document/viewIdentity";
import { type Dispatch, useCallback, useRef, useMemo } from "react";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { GraphAppState } from "../document/initialState";
import type { GraphAction } from "../document/graphActions";
import { useGraphPan } from "../../viewport/useGraphPan";
import { useSpatialGestures } from "../../viewport/useSpatialGestures";
import { useGraphZoom } from "../../viewport/useGraphZoom";
import { useGraphLayout } from "../layout/useGraphLayout";
import { useGraphNavigation } from "./useGraphNavigation";
import { useGraphInteractions } from "./useGraphInteractions";
interface ViewportInput {
  homeVisible: boolean;
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  openNodeDetail(key: string): void;
}
export function useGraphViewport(
  { state, dispatch, homeVisible, showNodeDetail, alignNodeWidthsToMax, openNodeDetail }: ViewportInput,
  appearance: GraphAppearance,
) {
  const navigation = useGraphNavigation(state, dispatch, (key) => zoom.captureLayoutAnchor(key));
  const { compound, activeType, typeFilter, activeTrack, activeTimelineRange } = navigation;
  const {
    stage: computedStage,
    currentLayoutConfig,
    layoutRenderingContext,
    status,
    parentSelection,
    timelineView,
    compoundLayout,
    spatialView,
  } = useGraphLayout({
    state,
    appearance,
    compound,
    typeFilter,
    activeType,
    activeTrack,
    activeTimelineRange,
    showNodeDetail,
    alignNodeWidthsToMax,
  });
  const stage = homeVisible ? null : computedStage;
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const overlaysRef = useRef<HTMLDivElement>(null);
  const handleZoomChange = useCallback(
    (scale: number, minScale?: number) => {
      dispatch({ type: "zoomChanged", scale, minScale });
    },
    [dispatch],
  );
  const documentIdentity = useMemo(() => documentViewIdentity(state), [state.document.id, state.document.generation]);
  const zoom = useGraphZoom({
    containerRef,
    svgRef,
    overlaysRef,
    stage,
    viewKey: JSON.stringify([
      documentIdentity,
      state.chartType,
      state.chartType === "spatial" ? spatialView.resetVersion : 0,
      state.chartType === "compound" ? compound.view.focusGroupId : state.selection,
      ...(state.chartType === "timeline"
        ? [state.timelineSettings.orientation]
        : [typeFilter, activeTrack, activeTimelineRange]),
    ]),
    scale: state.zoom.scale,
    minScale: state.zoom.minScale,
    maxScale: state.zoom.maxScale,
    onZoomChange: handleZoomChange,
  });

  useGraphPan({
    containerRef,
    enabled: Boolean(stage) && stage?.layoutMode !== "spatial",
  });
  useSpatialGestures({
    containerRef,
    enabled: stage?.layoutMode === "spatial",
    canOrbit:
      spatialView.view.projection !== "map" &&
      (spatialView.metadata?.coordinateSystem === "geographic" ? 3 : (spatialView.metadata?.dimensions ?? 0)) >= 3,
    viewKey: `${state.document.generation}:${state.chartType}`,
    onOrbit: spatialView.orbit,
    onPan: zoom.panBy,
    onZoom: zoom.zoomBy,
  });

  const interactions = useGraphInteractions({
    state,
    dispatch,
    activeType,
    stage,
    openNodeDetail,
    setFocusedKey: navigation.setFocusedKey,
  });
  return {
    currentLayoutConfig,
    layoutRenderingContext,
    timelineSettings: state.timelineSettings,
    changeTimelineSettings: (patch: Partial<TimelineViewSettings>) =>
      dispatch({ type: "timelineSettingsChanged", patch }),
    readaptTimeline: timelineView.readapt,
    timelineLayout: timelineView,
    pinTimelineNode:
      state.chartType === "timeline" && state.timelineSettings.layout === "flow"
        ? (key: string, x: number) =>
            dispatch({ type: "timelineSettingsChanged", patch: { pins: { ...state.timelineSettings.pins, [key]: x } } })
        : undefined,
    ...navigation,
    ...interactions,
    compoundLayout,
    spatialView,
    containerRef,
    svgRef,
    overlaysRef,
    stage,
    status,
    changeType: (type: string) => {
      interactions.clearPendingNodeClick();
      navigation.changeType(type);
    },
    changeTypeFilter: (filter: typeof typeFilter) => {
      interactions.clearPendingNodeClick();
      navigation.changeTypeFilter(filter);
    },
    up: () => navigation.up(parentSelection),
    showAll: () => {
      interactions.clearPendingNodeClick();
      navigation.showAll();
      timelineView.reset();
    },
    zoom,
    canBack:
      state.chartType === "compound"
        ? compound.canBack
        : Boolean(activeType || activeTrack || activeTimelineRange) ||
          (state.chartType !== "timeline" && state.history.length > 0),
    canUp: state.chartType === "compound" ? Boolean(compound.view.focusGroupId) : Boolean(parentSelection),
    zoomPercent: Number((state.zoom.scale * 100).toFixed(state.zoom.scale < 0.1 ? 1 : 0)),
    canZoomOut: Boolean(stage) && state.zoom.scale > state.zoom.minScale + 0.001,
    canZoomIn: Boolean(stage) && state.zoom.scale < state.zoom.maxScale - 0.001,
  };
}
export type GraphViewportController = ReturnType<typeof useGraphViewport>;
