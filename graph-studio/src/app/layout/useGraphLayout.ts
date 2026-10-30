import { documentViewIdentity } from "../document/viewIdentity";
import type { TypeFilter } from "../../graph/typeFilter";
import { createLayoutConfigFile } from "../../schema/layoutConfig";
import { graphLayoutIdentity, layoutIdentity, renderingSettings, type LayoutScope } from "../../schema/layoutGeometry";
import { useSpatialView } from "../viewport/useSpatialView";
import { prepareSpatialModel } from "../../layout/spatial/model";
import { projectSpatialModel } from "../../layout/spatial/project";
import { paintScene } from "../../render/scene/paint";
import { timelineGeometrySettings } from "../../layout/timeline/settings";
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
import { useCompoundLayout } from "./useCompoundLayout";
import { useTimelineStage } from "./useTimelineStage";
import { type StageAppearance, getStageAppearance } from "../../layout/shared/appearance";
import { useFlatLayout } from "./useFlatLayout";
import type { GraphAppState } from "../document/initialState";
interface LayoutInput {
  state: GraphAppState;
  appearance: GraphAppearance;
  compound: { view: CompoundView };
  activeType: string;
  typeFilter: TypeFilter;
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
  typeFilter,
  activeTrack,
  activeTimelineRange,
  showNodeDetail,
  alignNodeWidthsToMax,
}: LayoutInput) {
  const documentIdentity = useMemo(() => documentViewIdentity(state), [state.document.id, state.document.generation]);
  const spatialView = useSpatialView(
    state.dag,
    state.document.generation,
    documentIdentity,
    state.layoutSession.data.renderings?.spatial?.scope.spatial,
  );
  const typeFilteredDag = useMemo(
    () =>
      state.dag && state.chartType !== "compound" ? projectGraphByType(state.dag, typeFilter, state.chartType) : null,
    [typeFilter, state.dag, state.chartType],
  );
  const displayDag = useMemo(
    () => typeFilteredDag && projectGraphByTimelineTrack(typeFilteredDag, activeTrack),
    [typeFilteredDag, activeTrack],
  );
  const renderMode = getGraphRenderMode(state.chartType, state.layout.mode);
  const graphText = useMemo(
    () => (state.dag ? JSON.stringify([state.dag.nodes, state.dag.edges.map((e) => e.value)]) : ""),
    [state.dag],
  );
  const fontMetricsKey = useFontMetricsKey(appearance, state.chartType, graphText);
  const geometryJson = JSON.stringify(getStageAppearance(appearance, state.chartType, fontMetricsKey));
  const requestedGeometry = useMemo(() => JSON.parse(geometryJson) as StageAppearance, [geometryJson]);
  const geometryAppearance = useDebouncedValue(requestedGeometry);
  const timelineJson = JSON.stringify(timelineGeometrySettings(state.timelineSettings));
  const requestedTimeline = useMemo(() => JSON.parse(timelineJson) as typeof state.timelineSettings, [timelineJson]);
  const timelineSettings = useDebouncedValue(requestedTimeline);
  const axesKey = JSON.stringify(spatialView.view.axes);
  const spatialModel = useMemo(
    () => (state.chartType === "spatial" && state.dag ? prepareSpatialModel(state.dag, spatialView.view.axes) : null),
    [state.chartType, state.dag, axesKey],
  );
  const scope: LayoutScope = {
    selection: state.selection,
    compound: compound.view,
    activeType,
    typeFilter,
    activeTrack,
    timelineRange: activeTimelineRange,
    spatial: spatialView.view,
  };
  const saved = state.layoutSession.data.renderings?.[state.chartType];
  const settingsKey = JSON.stringify(
    renderingSettings(state.chartType, state.layoutSession.data.charts, scope, state.timelineSettings),
  );
  const timelineView = useTimelineStage({
    dag: state.chartType === "timeline" ? state.dag : null,
    visibleDag: state.chartType === "timeline" ? displayDag : null,
    generation: state.document.generation,
    settings: timelineSettings,
    appearance: geometryAppearance,
    showNodeDetail,
    range: activeTimelineRange,
    saved: state.layoutSession.data.renderings?.timeline,
    settingsFingerprint: layoutIdentity(JSON.parse(settingsKey)),
  });
  const flatInput = useMemo(
    () =>
      displayDag && (state.chartType === "node-link" || state.chartType === "sankey")
        ? {
            dag: displayDag,
            colorSourceDag: state.dag ?? undefined,
            selection: activeType ? { type: "full" as const } : state.selection,
            layoutMode: renderMode,
            appearance: geometryAppearance,
            showNodeDetail,
            alignNodeWidthsToMax,
          }
        : null,
    [
      displayDag,
      state.chartType,
      state.dag,
      activeType,
      state.selection,
      renderMode,
      geometryAppearance,
      showNodeDetail,
      alignNodeWidthsToMax,
    ],
  );
  const flatLayout = useFlatLayout(flatInput, state.document.generation);
  const spatialStage = useMemo(
    () =>
      spatialModel && displayDag
        ? projectSpatialModel(spatialModel, {
            dag: displayDag,
            spaceView: spatialView.view,
            appearance: geometryAppearance,
          })
        : null,
    [spatialModel, displayDag, spatialView.view, geometryAppearance],
  );
  const flatStage =
    state.chartType === "timeline"
      ? timelineView.stage
      : state.chartType === "spatial"
        ? spatialStage
        : flatLayout.stage;
  const compoundInput = useMemo(
    () =>
      state.chartType === "compound" && state.dag
        ? {
            dag: state.dag,
            view: compound.view,
            layout: state.layoutSession.data.charts.compound,
            showEdgeLabels: appearance.display.showEdgeLabels,
            selectedType: typeFilter,
            appearance: geometryAppearance,
            showNodeDetail,
            alignNodeWidthsToMax,
          }
        : null,
    [
      state.chartType,
      state.dag,
      compound.view,
      state.layoutSession.data.charts.compound,
      activeType,
      typeFilter,
      geometryAppearance,
      showNodeDetail,
      alignNodeWidthsToMax,
      appearance.display.showEdgeLabels,
    ],
  );
  const compoundLayout = useCompoundLayout(
    compoundInput,
    state.document.generation,
    saved,
    layoutIdentity(JSON.parse(settingsKey)),
  );
  const computedStage = state.chartType === "compound" ? compoundLayout.stage : flatStage;
  const geometryStage = computedStage;
  const stage = useMemo(
    () =>
      geometryStage && state.dag ? paintScene(geometryStage, state.dag, appearance, state.timelineSettings) : null,
    [geometryStage, state.dag, appearance.palette, state.timelineSettings],
  );
  const currentLayoutConfig = useMemo(
    () =>
      state.dag ? createLayoutConfigFile(state.layoutSession.data, state.chartType, state.timelineSettings) : null,
    [state.dag, state.layoutSession.data.charts, state.chartType, state.timelineSettings],
  );
  const layoutRenderingContext = useMemo(
    () =>
      state.dag
        ? {
            inputFingerprint:
              state.chartType === "compound"
                ? compoundLayout.prepared?.problem.fingerprint
                : state.chartType === "timeline"
                  ? timelineView.inputKey
                  : undefined,
            graphFingerprint: graphLayoutIdentity(state.dag),
            settingsFingerprint: layoutIdentity(JSON.parse(settingsKey)),
            scope,
            timelineSettings: state.timelineSettings,
          }
        : null,
    [
      state.dag,
      settingsKey,
      state.timelineSettings,
      compoundLayout.prepared?.problem.fingerprint,
      timelineView.inputKey,
    ],
  );
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
      if (!stage && compoundInput?.layout?.method === "ai")
        return "AI layout is ready. Describe the layout to generate.";
      return stage
        ? `${stage.nodes.length} visible nodes and summaries · ${stage.groups?.length ?? 0} expanded groups · ${stage.edges.length} visible relationships`
        : "No nodes match this view.";
    }
    if (flatLayout.error) return `Layout failed: ${flatLayout.error}`;
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
    typeFilter,
    activeTrack,
    stage,
    state.dag,
    state.layout.mode,
    state.ui.status,
    state.chartType,
    compoundLayout.loading,
    compoundLayout.error,
    flatLayout.error,
  ]);

  return {
    stage,
    currentLayoutConfig,
    layoutRenderingContext,
    status,
    parentSelection,
    timelineView: {
      ...timelineView,
      ready: timelineSettings === requestedTimeline && requestedGeometry === geometryAppearance,
    },
    compoundLayout,
    spatialView,
  };
}
