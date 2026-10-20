import { getTimelineClock } from "../graph/timelineClock";
import { getGroupNodes } from "../graph/hierarchy";
import { type Dispatch, useEffect, useMemo, useState } from "react";
import { getFullGraphSelection } from "../graph/selectors";
import { getGraphTypeOptions } from "../graph/typeFilter";
import { getTimelineTrackOptions } from "../graph/timelineView";
import type { TimelineTimeRange } from "../graph/timelineRange";
import type { CompoundView, GraphSelection } from "../graph/types";
import { useCompoundView } from "../controllers/useCompoundView";
import type { GraphAppState } from "../state/initialState";
import type { GraphAction } from "../state/graphActions";
export function useGraphNavigation(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  captureLayoutAnchor: (key: string) => void,
) {
  const compound = useCompoundView(state.document.id, Object.keys(getGroupNodes(state.dag)));
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState("");
  const [selectedTrack, setSelectedTrack] = useState("");
  const [timelineRange, setTimelineRange] = useState<TimelineTimeRange | null>(null);
  const activeTimelineRange = state.chartType === "timeline" ? timelineRange : null;
  const typeOptions = useMemo(() => (state.dag ? getGraphTypeOptions(state.dag) : []), [state.dag]);
  const activeType = typeOptions.includes(selectedType) ? selectedType : "";
  const trackOptions = useMemo(() => (state.dag ? getTimelineTrackOptions(state.dag) : []), [state.dag]);
  const activeTrack = state.chartType === "timeline" && trackOptions.includes(selectedTrack) ? selectedTrack : "";
  useEffect(() => {
    setSelectedTrack("");
    setTimelineRange(null);
    setSelectedType("");
    setFocusedKey(null);
  }, [state.document.generation]);
  const timeBasis = getTimelineClock(state.dag?.metadata).mode;
  useEffect(() => setTimelineRange(null), [timeBasis]);
  useEffect(() => {
    if (selectedType && !typeOptions.includes(selectedType)) {
      setSelectedType("");
    }
  }, [selectedType, typeOptions]);

  function changeType(type: string) {
    setFocusedKey(null);
    setSelectedType(type);
  }
  function back() {
    if (state.chartType === "compound") compound.back();
    else if (activeTimelineRange) setTimelineRange(null);
    else if (activeTrack) setSelectedTrack("");
    else if (activeType) changeType("");
    else dispatch({ type: "navigateBack" });
  }
  function up(parentSelection: GraphSelection | null) {
    if (state.chartType === "compound") {
      const id = compound.view.focusGroupId;
      enterGroup(id ? (state.dag?.hierarchy_edges?.find((edge) => edge.target === id)?.source ?? null) : null);
      return;
    }
    if (parentSelection) dispatch({ type: "selectionChanged", selection: parentSelection, pushHistory: true });
  }
  function showAll() {
    changeType("");
    setSelectedTrack("");
    setTimelineRange(null);

    if (state.chartType === "compound") {
      enterGroup(null);
      return;
    }
    dispatch({ type: "selectionChanged", selection: getFullGraphSelection(), pushHistory: true });
  }
  function enterGroup(id: string | null) {
    setFocusedKey(null);
    compound.setView({ ...compound.view, focusGroupId: id });
  }
  function toggleGroup(id: string) {
    changeCompoundView({
      ...compound.view,
      collapsedGroupIds: compound.view.collapsedGroupIds.includes(id)
        ? compound.view.collapsedGroupIds.filter((key) => key !== id)
        : [...compound.view.collapsedGroupIds, id],
    });
  }
  function changeCompoundView(view: CompoundView) {
    setFocusedKey(null);
    if (view.focusGroupId === compound.view.focusGroupId) {
      const before = new Set(compound.view.collapsedGroupIds);
      const after = new Set(view.collapsedGroupIds);
      const changed = [...new Set([...before, ...after])].filter((id) => before.has(id) !== after.has(id));
      if (changed.length === 1) captureLayoutAnchor(changed[0]);
    }
    compound.setView(view);
  }

  return {
    focusedKey,
    setFocusedKey,
    typeOptions,
    trackOptions,
    activeType,
    activeTrack,
    activeTimelineRange,
    compound: { ...compound, setView: changeCompoundView },
    enterGroup,
    toggleGroup,
    changeType,
    back,
    up,
    showAll,
    changeTimelineRange: (range: TimelineTimeRange | null) => {
      setFocusedKey(null);
      setTimelineRange(range);
    },
    changeTrack: (track: string) => {
      setFocusedKey(null);
      setSelectedTrack(track);
    },
  };
}
