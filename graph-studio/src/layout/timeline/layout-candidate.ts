import { parseTimelineLayoutPlan, validateTimelineLayoutPlan } from "../../graph/timelineLayout";
import type { StageData } from "../shared/types";
import type { TimelineLayoutInput } from "./input-types";
import { buildTimelineStage } from "./layout";
import { measureTimelineLayout, validateTimelineArrangement } from "./layout-quality";

export type { TimelineLayoutInput } from "./input-types";
export function evaluateTimelineLayout(input: TimelineLayoutInput, baseline: StageData, raw: unknown) {
  const plan = parseTimelineLayoutPlan(raw);
  validateTimelineLayoutPlan(plan, input.dag, input.timelineSettings?.layout === "flow");
  if (baseline.nodes.length > 2000 || baseline.edges.length > 4000)
    throw new Error(
      "Filter the timeline and use Readapt before arranging more than 2,000 events or 4,000 relationships.",
    );
  const stage = buildTimelineStage({
    ...input,
    arrangement: plan,
    timelineAxis: baseline.timeline?.axisMap,
    nodeLabels: Object.fromEntries(
      baseline.nodes.map((node) => [node.key, { width: node.width, displayTitle: node.displayTitle }]),
    ),
  });
  if (!stage) throw new Error("No timeline events to arrange.");
  const errors = validateTimelineArrangement(baseline, stage);
  if (errors.length) throw new Error(errors.join(" "));
  return { plan, stage, before: measureTimelineLayout(baseline), after: measureTimelineLayout(stage, baseline) };
}
export type TimelineLayoutCandidate = ReturnType<typeof evaluateTimelineLayout>;
