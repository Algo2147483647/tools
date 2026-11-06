import { paintScene } from "../../render/scene/paint";
import { useEffect, useMemo, useState } from "react";
import { useCompoundLayout } from "../../app/layout/useCompoundLayout";
import { useFontMetricsKey } from "../../app/layout/useFontMetricsKey";
import { useTimelineStage } from "../../app/layout/useTimelineStage";
import { type CompoundView } from "../../graph/types";
import { useDebouncedValue } from "../../shared/hooks/useDebouncedValue";
import {
  buildFlatPreviewStage,
  compoundPreviewInput,
  INITIAL_PREVIEW_VIEW,
  PREVIEW_GRAPHS,
  previewGeometry,
  timelinePreviewGraph,
} from "./previewModel";

import AppearancePreviewFrame, { type AppearancePreviewFrameProps } from "./AppearancePreviewFrame";
import type { GraphChartType, GraphLayoutMode } from "../../graph/types";
import type { TimelineClock } from "../../graph/timeline/clock";
import type { TimelineViewSettings } from "../../schema/appearance/types";

export interface AppearancePreviewProps extends Pick<
  AppearancePreviewFrameProps,
  "appearance" | "hideNodeBorders" | "mode" | "onModeChange"
> {
  chartType: GraphChartType;
  layoutMode: GraphLayoutMode;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  timelineSettings?: TimelineViewSettings;
  timelineClock?: TimelineClock;
}

export default function AppearancePreview(props: AppearancePreviewProps) {
  const { appearance, chartType, layoutMode, showNodeDetail, alignNodeWidthsToMax, timelineSettings, timelineClock } =
    props;
  const [view, setView] = useState<CompoundView>(INITIAL_PREVIEW_VIEW);
  const fontMetricsKey = useFontMetricsKey(appearance, chartType, "Graph preview ABCdef0123");
  const json = JSON.stringify(
    previewGeometry({
      appearance,
      fontMetricsKey,
      chartType,
      layoutMode,
      showNodeDetail,
      alignNodeWidthsToMax,
      timelineSettings,
      timelineClock,
      view,
    }),
  );
  const requested = useMemo(() => JSON.parse(json) as ReturnType<typeof previewGeometry>, [json]);
  const geometry = useDebouncedValue(requested);
  const compoundInput = useMemo(
    () => (geometry.chartType === "compound" ? compoundPreviewInput(geometry) : null),
    [geometry],
  );
  const compound = useCompoundLayout(compoundInput, 0);
  const timelineSample = useMemo(
    () => (geometry.chartType === "timeline" ? timelinePreviewGraph(geometry.timelineClock) : PREVIEW_GRAPHS.timeline),
    [geometry.chartType, geometry.timelineClock],
  );
  const timeline = useTimelineStage({
    dag: geometry.chartType === "timeline" ? timelineSample : null,
    visibleDag: timelineSample,
    generation: 0,
    range: null,
    settings: geometry.timelineSettings,
    appearance: geometry.appearance,
    showNodeDetail: geometry.showNodeDetail,
  });
  const flat = useMemo(() => {
    try {
      return { stage: geometry.chartType === "timeline" ? null : buildFlatPreviewStage(geometry), error: "" };
    } catch (error) {
      return { stage: null, error: error instanceof Error ? error.message : "Unable to render preview." };
    }
  }, [geometry]);
  const matches = geometry.chartType === chartType;
  const rawStage = matches
    ? chartType === "compound"
      ? compound.stage
      : chartType === "timeline"
        ? timeline.stage
        : flat.stage
    : null;
  const stage = useMemo(
    () =>
      rawStage
        ? paintScene(
            rawStage,
            chartType === "timeline" ? timelineSample : PREVIEW_GRAPHS[chartType],
            appearance,
            timelineSettings,
          )
        : null,
    [rawStage, chartType, timelineSample, appearance.palette, timelineSettings],
  );
  const error = matches ? (chartType === "compound" ? compound.error : flat.error) : "";
  const loading = requested !== geometry || (chartType === "compound" && compound.loading);
  useEffect(() => setView(INITIAL_PREVIEW_VIEW), [chartType]);
  return (
    <AppearancePreviewFrame
      {...props}
      stage={stage}
      error={error}
      loading={loading}
      onReset={() => setView(INITIAL_PREVIEW_VIEW)}
      onToggle={(id) =>
        setView((current) => ({
          ...current,
          collapsedGroupIds: current.collapsedGroupIds.includes(id)
            ? current.collapsedGroupIds.filter((key) => key !== id)
            : [...current.collapsedGroupIds, id],
        }))
      }
      onEnter={(id) => setView((current) => ({ ...current, focusGroupId: id }))}
    />
  );
}
