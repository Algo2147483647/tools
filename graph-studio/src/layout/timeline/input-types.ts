import { type ParsedTimelineTime } from "../../graph/timeline/time";
import type { TimelineViewSettings } from "../../schema/appearance/types";
import type { GraphSelection, NodeKey, NormalizedDag } from "../../graph/types";
import { type StageAppearance } from "../shared/appearance";
import { type TimelineAxisMap } from "./axis";
export interface TimelineEntry {
  key: NodeKey;
  time: ParsedTimelineTime;
  track: string;
  lane: number;
  startY: number;
  endY: number;
}
export interface TimelineLayoutInput {
  dag: NormalizedDag;
  selection: GraphSelection | null;
  appearance?: StageAppearance;
  showNodeDetail?: boolean;
  now?: number;
  timeRange?: { start?: number; end?: number };
  timelineSettings?: Partial<TimelineViewSettings>;
  timelineAxis?: TimelineAxisMap;
  axisSource?: NormalizedDag;
}
