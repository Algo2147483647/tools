export type { TimelineViewSettings, TimelineMarkerSettings, TimelineTickUnit } from "../schema/appearanceModel";
export {
  resolveTimeline as sanitizeTimelineSettings,
  resolveMarker as sanitizeTimelineMarker,
} from "../schema/appearanceContract";
