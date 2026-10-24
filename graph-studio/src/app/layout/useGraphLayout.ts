import { useSpatialView } from "../viewport/useSpatialView";
import { buildSpatialStage } from "../../layout/spatial/layout";
import { useFontMetricsKey } from "./useFontMetricsKey";
import { useMemo } from "react";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import { getNodeTitle } from "../../graph/accessors";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import { getParentLevelSelection, sanitizeNodeLabel } from "../../graph/selectors";
import { projectGraphByType } from "../../graph/typeFilter";
import { projectGraphByTimelineTrack } from "../../graph/timeline/view";
import type { TimelineTimeRange } from "../../graph/timeline/range";
import { getGraphLayoutLabel, getGraphRenderMode, type CompoundView } from "../../graph/types";
import { useCompoundStage } from "./useCompoundStage";
import { useTimelineStage } from "./useTimelineStage";
import { type StageAppearance, getStageAppearance } from "../../layout/shared/appearance";
import { buildStageData } from "../../layout/node-link/layout";
import type { GraphAppState } from "../document/initialState";
interface LayoutInput {
  state: GraphAppState;
  appearance: GraphAppearance;
  compound: { view: CompoundView };
  activeType: string;
  activeTrack: string;
  activeTimelineRange: TimelineTimeRange | null;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
}
export function useGraphLayout({
  state,
  appearance,
  compound,
  activeType,
  activeTrack,
  activeTimelineRange,
  showNodeDetail,
  alignNodeWidthsToMax,
}: LayoutInput) {
  const spatialView = useSpatialView(state.dag, state.document.generation);
  const typeFilteredDag = useMemo(
    () =>
      state.dag && state.chartType !== "compound" ? projectGraphByType(state.dag, activeType, state.chartType) : null,
    [activeType, state.dag, state.chartType],
  );
  const displayDag = useMemo(
    () => typeFilteredDag && projectGraphByTimelineTrack(typeFilteredDag, activeTrack),
    [typeFilteredDag, activeTrack],
  );
  const renderMode = getGraphRenderMode(state.chartType, state.layout.mode);
  const fontMetricsKey = useFontMetricsKey();
  const geometryJson = JSON.stringify(getStageAppearance(appearance, state.chartType, fontMetricsKey));
  const requestedGeometry = useMemo(() => JSON.parse(geometryJson) as StageAppearance, [geometryJson]);
  const geometryAppearance = useDebouncedValue(requestedGeometry);
  const timelineSettings = useDebouncedValue(state.timelineSettings);
  const timelineView = useTimelineStage({
    dag: state.chartType === "timeline" ? state.dag : null,
    visibleDag: state.chartType === "timeline" ? displayDag : null,
    generation: state.document.generation,
    settings: timelineSettings,
    appearance: geometryAppearance,
    showNodeDetail,
    range: activeTimelineRange,
  });
  const flatStage = useMemo(
    () =>
      displayDag
        ? state.chartType === "timeline"
          ? timelineView.stage
          : state.chartType === "spatial"
            ? buildSpatialStage({
                dag: displayDag,
                colorSourceDag: state.dag ?? undefined,
                spaceView: spatialView.view,
                appearance: geometryAppearance,
              })
            : buildStageData({
                dag: displayDag,
                colorSourceDag: state.dag ?? undefined,
                selection: activeType ? { type: "full" } : state.selection,
                layoutMode: renderMode,
                appearance: geometryAppearance,
                showNodeDetail,
                alignNodeWidthsToMax,
              })
        : null,
    [
      activeType,
      alignNodeWidthsToMax,
      geometryAppearance,
      displayDag,
      state.dag,
      showNodeDetail,
      renderMode,
      state.selection,
      state.chartType,
      activeTimelineRange,
      timelineView.stage,
      spatialView.view,
    ],
  );
  const compoundInput = useMemo(
    () =>
      state.chartType === "compound" && state.dag
        ? {
            dag: state.dag,
            view: compound.view,
            showEdgeLabels: appearance.display.showEdgeLabels,
            selectedType: activeType,
            appearance: geometryAppearance,
            showNodeDetail,
            alignNodeWidthsToMax,
          }
        : null,
    [
      state.chartType,
      state.dag,
      compound.view,
      activeType,
      geometryAppearance,
      showNodeDetail,
      alignNodeWidthsToMax,
      appearance.display.showEdgeLabels,
    ],
  );
  const compoundLayout = useCompoundStage(compoundInput);
  const stage = state.chartType === "compound" ? compoundLayout.stage : flatStage;
  const parentSelection = useMemo(
    () =>
      state.chartType !== "compound" &&
      state.chartType !== "timeline" &&
      state.chartType !== "spatial" &&
      !activeType &&
      state.dag &&
      stage
        ? getParentLevelSelection(state.dag, stage.topLevelKeys)
        : null,
    [activeType, stage, state.dag, state.chartType],
  );
  const status = useMemo(() => {
    if (state.chartType === "compound") {
      if (compoundLayout.loading) return "Arranging subgraphs…";
      if (compoundLayout.error) return `Nested layout failed: ${compoundLayout.error}`;
      return stage
        ? `${stage.nodes.length} visible nodes and summaries · ${stage.groups?.length ?? 0} expanded groups · ${stage.edges.length} visible relationships`
        : "No nodes match this view.";
    }
    if (!state.dag || !stage) {
      if (state.chartType === "timeline" && state.dag)
        return "No events match these filters. Choose Show all events to restore the timeline.";
      return state.ui.status;
    }
    if (state.chartType === "timeline")
      return `Timeline · UTC. ${stage.nodes.length} events and ${stage.edges.length} relationships.${activeTrack ? ` Track: ${activeTrack}.` : ""} ${stage.warnings.join(" ")}`;
    if (state.chartType === "spatial")
      return `Spatial · ${spatialView.metadata?.dimensions ?? "?"}D · ${stage.nodes.length} nodes · ${stage.edges.length} links${activeType ? ` · ${activeType}` : ""}`;
    const focusNode = stage.dag[stage.root];
    const focusTitle = focusNode ? getNodeTitle(focusNode) : "";
    const focusLabel = focusNode?.synthetic
      ? focusTitle || "Selected roots"
      : sanitizeNodeLabel(focusTitle || stage.root);
    const layoutLabel = getGraphLayoutLabel(stage.layoutMode);
    const warningText = stage.warnings.length ? ` ${stage.warnings[0]}` : "";
    return state.ui.status &&
      !state.ui.status.includes("loaded from") &&
      !state.ui.status.startsWith("Mode:") &&
      !state.ui.status.startsWith("Layout:") &&
      !state.ui.status.startsWith("Chart type:")
      ? state.ui.status
      : `${layoutLabel}.${activeType ? ` Type: ${activeType}.` : ` Focused on ${focusLabel}.`} ${stage.nodes.length} nodes and ${stage.edges.length} links are visible.${warningText}`;
  }, [
    activeType,
    activeTrack,
    stage,
    state.dag,
    state.layout.mode,
    state.ui.status,
    state.chartType,
    compoundLayout.loading,
    compoundLayout.error,
  ]);

  return {
    stage,
    status,
    parentSelection,
    timelineView: {
      ...timelineView,
      ready: timelineSettings === state.timelineSettings && requestedGeometry === geometryAppearance,
    },
    compoundLayout,
    spatialView,
  };
}
