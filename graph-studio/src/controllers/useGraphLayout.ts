import { useMemo } from "react";
import { getNodeTitle } from "../graph/accessors";
import type { GraphAppearance } from "../graph/appearance";
import { getParentLevelSelection, sanitizeNodeLabel } from "../graph/selectors";
import { projectGraphByType } from "../graph/typeFilter";
import { projectGraphByTimelineTrack } from "../graph/timelineView";
import type { TimelineTimeRange } from "../graph/timelineRange";
import { getGraphLayoutLabel, getGraphRenderMode, type CompoundView } from "../graph/types";
import { useCompoundStage } from "../controllers/useCompoundStage";
import { useTimelineStage } from "../controllers/useTimelineStage";
import { type StageAppearance, getStageAppearance } from "../layout/appearance";
import { buildStageData } from "../layout/stage-layout";
import type { GraphAppState } from "../state/initialState";
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
  const displayDag = useMemo(
    () =>
      state.dag && state.chartType !== "compound"
        ? projectGraphByTimelineTrack(projectGraphByType(state.dag, activeType, state.chartType), activeTrack)
        : null,
    [activeType, activeTrack, state.dag, state.chartType],
  );
  const renderMode = getGraphRenderMode(state.chartType, state.layout.mode);
  const geometryJson = JSON.stringify(getStageAppearance(appearance));
  const geometryAppearance = useMemo(() => JSON.parse(geometryJson) as StageAppearance, [geometryJson]);
  const timelineView = useTimelineStage({
    dag: state.chartType === "timeline" ? state.dag : null,
    visibleDag: displayDag,
    generation: state.document.generation,
    settings: state.timelineSettings,
    appearance: geometryAppearance,
    showNodeDetail,
    range: activeTimelineRange,
  });
  const flatStage = useMemo(
    () =>
      displayDag
        ? state.chartType === "timeline"
          ? timelineView.stage
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
      state.chartType !== "compound" && state.chartType !== "timeline" && !activeType && state.dag && stage
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

  return { stage, status, parentSelection, timelineView, compoundLayout };
}
