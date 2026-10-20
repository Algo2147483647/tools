import { getTimelineClock } from "../graph/timelineClock";
import { useEffect, useMemo, useRef, useState } from "react";
import { parseNodeTimeline } from "../graph/timeline";
import { getTimelineReferenceTime } from "../graph/timelineEditing";
import type { NormalizedDag } from "../graph/types";
import { projectGraphDocument } from "../graph/serialize";
import type { TimelineViewSettings } from "../graph/timelineSettings";
import type { TimelineTimeRange } from "../graph/timelineRange";
import type { StageAppearance } from "../layout/appearance";
import { buildTimelineStage } from "../layout/timeline-layout";
import { projectTimelineStage } from "../layout/timeline-project";
import type { StageData } from "../layout/types";

/** Filters project an existing layout. Only an explicit readapt changes its scope. */
export function useTimelineStage(input: {
  dag: NormalizedDag | null;
  visibleDag: NormalizedDag | null;
  generation: number;
  settings: TimelineViewSettings;
  appearance: StageAppearance;
  showNodeDetail: boolean;
  range: TimelineTimeRange | null;
}) {
  const { dag, visibleDag, generation, settings, appearance, showNodeDetail, range } = input;
  const [scope, setScope] = useState<{
    generation: number;
    keys: string[];
    range: TimelineTimeRange | null;
    revision: number;
  } | null>(null);
  const retained = useRef<{ generation: number; revision: number; clock: string; stage: StageData | null }>();
  const activeScope = scope?.generation === generation ? scope : null;
  const asOf = getTimelineReferenceTime(dag);
  const currentKeys = useMemo(
    () =>
      Object.entries(visibleDag?.nodes ?? {})
        .filter(([, node]) => {
          if (!range) return true;
          const time = parseNodeTimeline(node, asOf, getTimelineClock(dag?.metadata));
          return (
            time.status === "dated" && time.end >= (range.start ?? -Infinity) && time.start <= (range.end ?? Infinity)
          );
        })
        .map(([key]) => key),
    [visibleDag, range, asOf, dag?.metadata],
  );
  const clock = JSON.stringify([settings.axis, settings.compactness, getTimelineClock(dag?.metadata)]);
  const scopeKeys = activeScope ? JSON.stringify([...new Set([...activeScope.keys, ...currentKeys])].sort()) : "";
  const scopeRange =
    activeScope?.range && range
      ? JSON.stringify({
          start:
            activeScope.range.start === undefined || range.start === undefined
              ? undefined
              : Math.min(activeScope.range.start, range.start),
          end:
            activeScope.range.end === undefined || range.end === undefined
              ? undefined
              : Math.max(activeScope.range.end, range.end),
        })
      : "";
  const revision = activeScope?.revision ?? 0;
  const base = useMemo(() => {
    if (!dag) return null;
    let source = dag;
    if (scopeKeys) {
      const keys = new Set<string>(JSON.parse(scopeKeys));
      source = projectGraphDocument(dag, keys);
    }
    const previous = retained.current;
    const keep =
      previous?.generation === generation &&
      previous.revision === revision &&
      previous.clock === clock &&
      (settings.locked || activeScope);
    return buildTimelineStage({
      dag: source,
      selection: { type: "full" },
      appearance,
      showNodeDetail,
      timelineSettings: settings,
      timelineAxis: keep ? previous.stage?.timeline?.axisMap : undefined,
      timeRange: scopeRange ? JSON.parse(scopeRange) : undefined,
    });
  }, [dag, generation, settings, appearance, showNodeDetail, scopeKeys, scopeRange, revision]);
  useEffect(() => {
    retained.current = { generation, revision, clock, stage: base };
  }, [base, generation, revision, clock]);
  const visibleKeys = useMemo(() => new Set(Object.keys(visibleDag?.nodes ?? {})), [visibleDag]);
  const stage = useMemo(() => projectTimelineStage(base, visibleKeys, range), [base, visibleKeys, range]);
  return {
    stage,
    readapt: () => {
      if (!settings.locked && stage)
        setScope({
          generation,
          keys: stage.nodes.map((node) => node.key),
          range,
          revision: (scope?.revision ?? 0) + 1,
        });
    },
    reset: () => setScope(null),
  };
}
