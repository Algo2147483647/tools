import { timelinePlanBasis } from "../../layout/timeline/plan-basis";
import type { TimelineLayoutData } from "../../graph/timeline/layoutData";
import { getTimelineClock } from "../../graph/timeline/clock";
import { useMemo, useState } from "react";
import { parseNodeTimeline } from "../../graph/timeline/time";
import { getTimelineReferenceTime } from "../../graph/timeline/editing";
import type { NormalizedDag } from "../../graph/types";
import { projectGraphDocument } from "../../graph/serialize";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { TimelineTimeRange } from "../../graph/timeline/range";
import type { StageAppearance } from "../../layout/shared/appearance";
import { buildTimelineStage } from "../../layout/timeline/layout";
import { projectTimelineStage } from "../../layout/timeline/project";

/** Filters project an existing layout. Only an explicit readapt changes its scope. */
export function useTimelineStage(input: {
  dag: NormalizedDag | null;
  visibleDag: NormalizedDag | null;
  generation: number;
  settings: TimelineViewSettings;
  layout?: TimelineLayoutData;
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
  const activeScope = scope?.generation === generation ? scope : null;
  const asOf = getTimelineReferenceTime(dag);
  const clockMode = getTimelineClock(dag?.metadata).mode;
  const referenceTime = useMemo(
    () => asOf ?? (clockMode === "relative" ? 0 : Date.now()),
    [asOf, clockMode, generation],
  );
  const currentKeys = useMemo(
    () =>
      Object.entries(visibleDag?.nodes ?? {})
        .filter(([, node]) => {
          if (!range) return true;
          const time = parseNodeTimeline(node, referenceTime, getTimelineClock(dag?.metadata));
          return (
            time.status === "dated" && time.end >= (range.start ?? -Infinity) && time.start <= (range.end ?? Infinity)
          );
        })
        .map(([key]) => key),
    [visibleDag, range, referenceTime, dag?.metadata],
  );
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
  const layoutInput = useMemo(() => {
    if (!dag) return null;
    let source = dag;
    if (scopeKeys) {
      const keys = new Set<string>(JSON.parse(scopeKeys));
      source = projectGraphDocument(dag, keys);
    }
    const prepared = {
      dag: source,
      arrangement: input.layout?.mode === "ai" ? input.layout.plan : null,
      selection: { type: "full" as const },
      appearance,
      showNodeDetail,
      now: referenceTime,
      timelineSettings: settings,
      timeRange: scopeRange ? JSON.parse(scopeRange) : undefined,
    };
    if (input.layout?.basis && input.layout.basis !== timelinePlanBasis(prepared) && prepared.arrangement) {
      const { placements: _placements, routes: _routes, ...order } = prepared.arrangement;
      return { ...prepared, arrangement: order };
    }
    return prepared;
  }, [
    input.layout,
    dag,
    generation,
    settings,
    appearance,
    showNodeDetail,
    scopeKeys,
    scopeRange,
    revision,
    referenceTime,
  ]);
  const base = useMemo(() => (layoutInput ? buildTimelineStage(layoutInput) : null), [layoutInput]);
  const visibleKeys = useMemo(() => new Set(Object.keys(visibleDag?.nodes ?? {})), [visibleDag]);
  const stage = useMemo(() => projectTimelineStage(base, visibleKeys, range), [base, visibleKeys, range]);
  return {
    stage,
    base,
    layoutInput,
    readapt: () => {
      if (stage)
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
