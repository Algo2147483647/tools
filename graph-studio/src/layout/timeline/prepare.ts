import { getNodeType } from "../../graph/accessors";
import { DEFAULT_GRAPH_APPEARANCE } from "../../graph/appearance";
import { buildCategoryColorMap } from "../../graph/categoryColors";
import { getTimelineRelation, parseNodeTimeline, parseTimelineDate } from "../../graph/timeline/time";
import { getTimelineClock } from "../../graph/timeline/clock";
import { readTimelineLayout } from "../../graph/timeline/layoutData";
import { sanitizeTimelineSettings } from "../../graph/timeline/settings";
import { collectDescendantKeys } from "../../graph/traversal";
import { stageTitleFont, type StageAppearance } from "../shared/appearance";
import { resolveStageSelection } from "../shared/selection";
import { getRoleFont } from "../shared/typography";
import { createTimelineAxis, extendTimelineAxis, timelineTimeToY } from "./axis";
import type { TimelineEntry, TimelineLayoutInput } from "./input-types";
import { compareKeys } from "./ordering";
const DAY = 86_400_000;
export function prepareTimeline(input: TimelineLayoutInput) {
  const { dag, appearance = DEFAULT_GRAPH_APPEARANCE, showNodeDetail = false } = input;
  const savedLayout = readTimelineLayout(dag);
  const arrangement =
    input.arrangement === undefined
      ? savedLayout.data.mode === "ai"
        ? savedLayout.data.plan
        : undefined
      : input.arrangement;
  const settings = sanitizeTimelineSettings({
    ...input.timelineSettings,
    ...(arrangement?.edgeRouting ? { edgeRouting: arrangement.edgeRouting } : {}),
  });
  const clock = getTimelineClock(dag.metadata);
  const colorSource = Object.values((input.axisSource ?? dag).nodes);
  const typePalette = buildCategoryColorMap(colorSource.map(getNodeType), appearance.palette?.categories);
  const trackPalette = buildCategoryColorMap(
    colorSource.map((node) =>
      settings.layout === "flow" ? getNodeType(node) || "Events" : String(node.track || "Events"),
    ),
    appearance.palette?.categories,
  );
  const relative = clock.mode === "relative";
  const baseSpan = relative ? Math.max(1, settings.relativeTickStep) : DAY;
  const intervalWidth = Math.max(0, settings.intervalWidth);
  const flow = settings.layout === "flow";
  if (!Object.keys(dag.nodes).length) return null;
  if (
    input.timeRange !== undefined &&
    (!input.timeRange || typeof input.timeRange !== "object" || Array.isArray(input.timeRange))
  )
    return null;
  const rangeStart = input.timeRange?.start;
  const rangeEnd = input.timeRange?.end;
  const isValidBound = (value: number | undefined) =>
    value === undefined || (Number.isFinite(value) && (relative || Math.abs(value) <= 8.64e15));
  if (
    !isValidBound(rangeStart) ||
    !isValidBound(rangeEnd) ||
    (rangeStart !== undefined && rangeEnd !== undefined && rangeStart > rangeEnd)
  )
    return null;
  const filtered = rangeStart !== undefined || rangeEnd !== undefined;
  const theme = appearance;
  const titleFont = stageTitleFont(appearance);
  const dateFont = (appearance as StageAppearance).fonts?.date ?? getRoleFont(DEFAULT_GRAPH_APPEARANCE, "date");
  const detailFont = (appearance as StageAppearance).fonts?.detail ?? getRoleFont(DEFAULT_GRAPH_APPEARANCE, "detail");
  const labelMetrics = {
    top: Math.ceil(titleFont.size * 1.2),
    dateOffset: Math.ceil(titleFont.size * 0.4 + dateFont.size * 1.2),
    detailOffset: Math.ceil(titleFont.size * 0.4 + dateFont.size * 1.2 + detailFont.size * 1.5),
    bottom: 0,
  };
  labelMetrics.bottom = showNodeDetail
    ? labelMetrics.detailOffset + detailFont.size * 0.7
    : labelMetrics.dateOffset + dateFont.size * 0.7;
  const selection = resolveStageSelection(
    {
      ...dag,
      nodes: Object.fromEntries(
        Object.keys(dag.nodes)
          .sort(compareKeys)
          .map((key) => [key, dag.nodes[key]]),
      ),
    },
    input.selection || { type: "full" },
  );
  const selectedKeys = (
    selection.appSelection.type === "full"
      ? Object.keys(dag.nodes)
      : collectDescendantKeys(dag.nodes, selection.topLevelKeys)
  ).sort(compareKeys);
  const metadata = dag.metadata?.timeline;
  const asOf =
    metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? parseTimelineDate((metadata as Record<string, unknown>).asOf)?.timestamp
      : undefined;
  const now = input.now ?? asOf ?? (relative ? 0 : Date.now());
  const selectedEntries: TimelineEntry[] = selectedKeys.map((key) => ({
    key,
    time: parseNodeTimeline(dag.nodes[key], now, clock),
    track: flow
      ? getNodeType(dag.nodes[key]) || "Events"
      : typeof dag.nodes[key].track === "string" && String(dag.nodes[key].track).trim()
        ? String(dag.nodes[key].track).trim()
        : "Events",
    lane: 0,
    startY: 0,
    endY: 0,
  }));
  const entries = filtered
    ? selectedEntries.filter(
        (entry) =>
          entry.time.status === "dated" &&
          entry.time.end >= (rangeStart ?? -Infinity) &&
          entry.time.start <= (rangeEnd ?? Infinity),
      )
    : selectedEntries;
  if (!entries.length) return null;
  const keys = entries.map((entry) => entry.key);
  const included = new Set(keys);
  const sourceEdges = dag.edges
    .filter((edge) => included.has(edge.source) && included.has(edge.target))
    .sort((a, b) => compareKeys(a.id, b.id));
  const warnings = entries
    .filter((entry) => entry.time.status === "invalid")
    .map((entry) => `${entry.key}: ${entry.time.status === "invalid" ? entry.time.message : ""}`);
  if (savedLayout.warning) warnings.push(savedLayout.warning);
  const missingCount = entries.filter((entry) => entry.time.status === "missing").length;
  if (missingCount)
    warnings.push(
      `${missingCount} event${missingCount === 1 ? " has" : "s have"} no time; shown in the Undated region.`,
    );
  const trackStartTimes = new Map<string, number>();
  entries.forEach((entry) => {
    const firstTime = entry.time.status === "dated" ? entry.time.start : Infinity;
    trackStartTimes.set(entry.track, Math.min(trackStartTimes.get(entry.track) ?? Infinity, firstTime));
  });
  const trackRanks = new Map((arrangement?.trackOrder ?? []).map((track, index) => [track, index]));
  const tracks = [...trackStartTimes.keys()].sort(
    (a, b) =>
      (trackRanks.get(a) ?? Infinity) - (trackRanks.get(b) ?? Infinity) ||
      trackStartTimes.get(a)! - trackStartTimes.get(b)! ||
      compareKeys(a, b),
  );
  const dated = entries.filter((entry) => entry.time.status === "dated");
  const undated = entries.filter((entry) => entry.time.status !== "dated");
  const axisEntries = input.axisSource
    ? Object.values(input.axisSource.nodes).map((node) => parseNodeTimeline(node, now, clock))
    : dated.map((entry) => entry.time);
  const timestamps = axisEntries.flatMap((time) =>
    time.status === "dated" ? (time.start === time.end ? [time.start] : [time.start, time.end]) : [],
  );
  for (const edge of (input.axisSource ?? dag).edges) {
    const relation = getTimelineRelation(edge.metadata, relative);
    for (const [key, time] of [
      [edge.source, relation.sourceTime],
      [edge.target, relation.targetTime],
    ] as const) {
      if (time === undefined) continue;
      const node = (input.axisSource ?? dag).nodes[key];
      const parsed = node && parseNodeTimeline(node, now, clock);
      if (parsed?.status === "dated" && time >= parsed.start && time <= parsed.end) timestamps.push(time);
    }
  }
  let start = rangeStart ?? (timestamps.length ? Math.min(...timestamps) : null);
  let end = rangeEnd ?? (timestamps.length ? Math.max(...timestamps) : null);
  if (!filtered && start !== null && end === start) {
    start -= baseSpan / 2;
    end += baseSpan / 2;
  }
  const labelWidth = Math.max(0, theme.nodes.widths[1]);
  const labelStep = Math.max(
    labelMetrics.top + labelMetrics.bottom + 4,
    theme.nodes.height * 0.58 + theme.nodes.spacing.row * 0.2,
  );
  const trackCounts = new Map<string, number>();
  for (const node of Object.values(input.axisSource?.nodes ?? dag.nodes)) {
    if (parseNodeTimeline(node, now, clock).status !== "dated") continue;
    const track = typeof node.track === "string" && node.track.trim() ? node.track.trim() : "Events";
    trackCounts.set(track, (trackCounts.get(track) ?? 0) + 1);
  }
  const demand = !flow && settings.axis === "linear" ? Math.max(1, ...trackCounts.values()) : new Set(timestamps).size;
  const timelineHeight = timestamps.length
    ? Math.max(900, Math.min(!flow && settings.axis === "linear" ? 10_000 : 24_000, demand * labelStep * 1.45))
    : 0;
  const top = Math.max(112, theme.canvas.padding[1] + 32);
  const axisMap =
    start !== null && end !== null
      ? input.timelineAxis && input.timelineAxis.mode === settings.axis
        ? extendTimelineAxis(input.timelineAxis, start, end, top, baseSpan)
        : createTimelineAxis({
            start,
            end,
            originY: top,
            height: timelineHeight || 900,
            mode: settings.axis,
            compactness: settings.compactness,
            timestamps,
          })
      : undefined;
  if (axisMap) {
    start = axisMap.start;
    end = axisMap.end;
  }
  const scale = axisMap ? axisMap.height / (axisMap.end - axisMap.start || baseSpan) : 0;
  const yAt = (time: number) => (axisMap ? timelineTimeToY(axisMap, time) : top);
  const tickInterval =
    !relative && settings.axis === "linear" && settings.tickUnit !== "auto"
      ? { step: settings.tickStep, unit: settings.tickUnit }
      : undefined;
  dated.forEach((entry) => {
    if (entry.time.status === "dated") {
      entry.startY = yAt(Math.max(entry.time.start, rangeStart ?? -Infinity));
      entry.endY = yAt(Math.min(entry.time.end, rangeEnd ?? Infinity));
    }
  });

  return {
    input,
    dag,
    appearance,
    showNodeDetail,
    arrangement,
    settings,
    clock,
    typePalette,
    trackPalette,
    relative,
    intervalWidth,
    flow,
    rangeStart,
    rangeEnd,
    filtered,
    theme,
    titleFont,
    dateFont,
    detailFont,
    labelMetrics,
    selection,
    entries,
    keys,
    sourceEdges,
    warnings,
    tracks,
    dated,
    undated,
    start,
    end,
    labelWidth,
    labelStep,
    top,
    axisMap,
    scale,
    tickInterval,
  };
}
export type PreparedTimeline = NonNullable<ReturnType<typeof prepareTimeline>>;
