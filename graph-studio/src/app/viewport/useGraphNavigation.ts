import { getTimelineClock } from "../../graph/timeline/clock";
import { documentViewIdentity } from "../document/viewIdentity";
import { getGroupNodes } from "../../graph/compound/hierarchy";
import { type Dispatch, useEffect, useMemo, useState } from "react";
import { getGraphTypeOptions, emptyTypeFilter, type TypeFilter } from "../../graph/typeFilter";
import { getTimelineTrackOptions } from "../../graph/timeline/view";
import type { TimelineTimeRange } from "../../graph/timeline/range";
import type { CompoundView, GraphSelection } from "../../graph/types";
import { useCompoundView } from "./useCompoundView";
import type { GraphAppState } from "../document/initialState";
import type { GraphAction } from "../document/graphActions";
export function useGraphNavigation(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  captureLayoutAnchor: (key: string) => void,
) {
  const groupIds = useMemo(() => Object.keys(getGroupNodes(state.dag)), [state.dag]);
  const savedScope = state.layoutSession.data.renderings?.[state.chartType]?.scope;
  // File-input imports have no durable filesystem identity. Match their original
  // name and content; different files with the same name must not share a view.
  const cacheIdentity = useMemo(() => documentViewIdentity(state), [state.document.id, state.document.generation]);
  const compound = useCompoundView(
    state.document.id,
    groupIds,
    savedScope?.compound,
    state.document.generation,
    cacheIdentity,
  );
  const [focusedKey, setFocusedKey] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>(emptyTypeFilter);
  const [selectedTrack, setSelectedTrack] = useState("");
  const [timelineRange, setTimelineRange] = useState<TimelineTimeRange | null>(null);
  const activeTimelineRange = state.chartType === "timeline" ? timelineRange : null;
  const typeOptions = useMemo(() => (state.dag ? getGraphTypeOptions(state.dag) : []), [state.dag]);
  const activeType = typeFilter.enabled
    ? `${typeFilter.operation === "exclude" ? "Except " : ""}${typeFilter.values.join(", ") || "No types"}`
    : "";
  const trackOptions = useMemo(() => (state.dag ? getTimelineTrackOptions(state.dag) : []), [state.dag]);
  const activeTrack = state.chartType === "timeline" && trackOptions.includes(selectedTrack) ? selectedTrack : "";
  useEffect(() => {
    setSelectedTrack(savedScope?.activeTrack ?? "");
    setTimelineRange(savedScope?.timelineRange ?? null);
    setTypeFilter(
      savedScope?.typeFilter ?? {
        ...emptyTypeFilter(),
        enabled: !!savedScope?.activeType,
        values: savedScope?.activeType ? [savedScope.activeType] : [],
      },
    );
    setFocusedKey(null);
  }, [state.document.generation]);
  const timeBasis = getTimelineClock(state.dag?.metadata).mode;
  useEffect(() => setTimelineRange(savedScope?.timelineRange ?? null), [timeBasis]);
  useEffect(() => {
    setTypeFilter((previous) => {
      const values = previous.values.filter((type) => typeOptions.includes(type));
      return values.length === previous.values.length ? previous : { ...previous, values };
    });
  }, [typeOptions]);
  function changeTypeFilter(next: TypeFilter) {
    setFocusedKey(null);
    setTypeFilter({
      ...next,
      values: [...new Set(next.values)]
        .filter((type) => typeOptions.includes(type))
        .slice(0, next.selection === "single" ? 1 : undefined),
    });
  }
  function changeType(type: string) {
    changeTypeFilter({ ...emptyTypeFilter(), enabled: !!type, values: type ? [type] : [] });
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
    dispatch({ type: "selectionChanged", selection: { type: "full" }, pushHistory: true });
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
    typeFilter,
    changeTypeFilter,
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
