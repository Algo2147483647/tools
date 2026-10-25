import { applyTimelinePositions } from "./precise";
import type { StageData } from "../shared/types";
import { arrangeTimelineNodes } from "./arrange";
import type { TimelineLayoutInput } from "./input-types";
import { prepareTimeline } from "./prepare";
import { assembleTimelineStage } from "./stage";
export { routeTimelineEdge } from "./edge-routing";
export function buildTimelineStage(input: TimelineLayoutInput): StageData | null {
  const prepared = prepareTimeline(input);
  return prepared
    ? applyTimelinePositions(assembleTimelineStage(prepared, arrangeTimelineNodes(prepared)), input)
    : null;
}
