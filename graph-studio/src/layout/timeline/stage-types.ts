import type { TimelinePrecision, TimelineRelationKind } from "../../graph/timeline";
import type { TimelineClock } from "../../graph/timelineClock";
import type { TimelineViewSettings } from "../../graph/timelineSettings";
import type { StageData } from "../shared/types";
import type { TimelineAxisMap } from "./axis";
import type { TimelineTickInterval } from "./ticks";
/** startY/endY/anchorY are canonical time-axis coordinates (canvas x in horizontal mode).
 * labelX/labelY are physical canvas coordinates; text moves independently of time anchors. */
export interface StageTimelineNode {
  orientation?: "vertical" | "horizontal";
  intervalTitle?: TimelineViewSettings["intervalTitle"];
  intervalAlign?: TimelineViewSettings["intervalAlign"];
  intervalStyle?: TimelineViewSettings["intervalStyle"];
  intervalBorder?: TimelineViewSettings["intervalBorder"];
  intervalBorderWidth?: number;
  intervalBorderColor?: string;
  intervalRadius?: number;
  intervalTextColor?: string;
  intervalTextColorMode?: TimelineViewSettings["intervalTextColorMode"];
  pointMarker?: TimelineViewSettings["pointMarker"];
  anchorMarker?: TimelineViewSettings["anchorMarker"];
  pointTextColor?: string;
  pointDateVisible?: boolean;
  displayDate?: string;
  labelMetrics?: { top: number; bottom: number; dateOffset: number; detailOffset: number };
  pointDateColor?: string;
  leaderStyle?: TimelineViewSettings["leaderStyle"];
  leaderColor?: string;
  leaderWidth?: number;
  barWidth?: number;
  minimumCross?: number;
  /** One-based protocol row/column index perpendicular to time; unaffected by auto layout or view pins. */
  space?: number;
  status: "dated" | "missing" | "invalid";
  kind: "instant" | "range" | "undated";
  start: number | null;
  end: number | null;
  /** Original calendar timestamps or relative values remain above; clipping only changes the rendered endpoints below. */
  clippedStart?: boolean;
  clippedEnd?: boolean;
  ongoing: boolean;
  precision: TimelinePrecision | null;
  track: string;
  lane: number;
  startY: number;
  endY: number;
  anchorY: number;
  labelX: number;
  labelY: number;
  label: string;
  color: string;
  warning?: string;
  ports?: { time: number; y: number }[];
}

export interface StageTimelineEdge {
  sourceTime?: number;
  targetTime?: number;
  kind: TimelineRelationKind;
  backward: boolean;
  sourceAnchor: "start" | "end";
  targetAnchor: "start" | "end";
  color: string;
}

export interface StageTimelineData {
  /** Canonical cross-axis/time-axis geometry used when projecting a horizontal view. */
  canonicalStage?: StageData;
  orientation?: "vertical" | "horizontal";
  clock?: TimelineClock;
  relativeTickStep?: number;
  layout?: TimelineViewSettings["layout"];
  edgeRouting?: TimelineViewSettings["edgeRouting"];
  axisMap?: TimelineAxisMap;
  tickInterval?: TimelineTickInterval;
  timeZone: "UTC" | null;
  filtered?: boolean;
  axisX: number;
  /** Stage y coordinate corresponding to the start of the displayed time domain. */
  originY: number;
  start: number | null;
  end: number | null;
  /** Pixels per millisecond for calendar time; pixels per declared unit for relative time. */
  pixelsPerUnit: number;
  ticks: { time: number; y: number; label: string }[];
  /** Track x/width describe the complete header and content extent, not marker centers. */
  tracks: { id: string; label: string; x: number; width: number; color: string }[];
  undatedY: number | null;
}
