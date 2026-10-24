import { getTimelineClock } from "../graph/timelineClock";
import { readTimelineLayout, type TimelineLayoutPlan } from "../graph/timelineLayout";
import { orientTimelineStage } from "./timeline-orientation";
import { getNodeType } from "../graph/accessors";
import { timelineTypeColor } from "../graph/timelineColors";
import { buildCategoryColorMap, normalizeTypeLabel } from "../graph/categoryColors";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getTimelineRelation, parseNodeTimeline, parseTimelineDate, type ParsedTimelineTime } from "../graph/timeline";
import { collectDescendantKeys } from "../graph/traversal";
import type { GraphEdge, GraphSelection, NodeKey, NormalizedDag } from "../graph/types";
import { stageTitleFont, type StageAppearance } from "./appearance";
import { resolveStageSelection } from "./selection";
import { estimateTextWidth, getNodeVisual, wrapDetailText, measureText, fitMeasuredText } from "./text";
import type { StageData, StageEdge, StageNode, StageRoutePoint, StageTimelineData } from "./types";
import { sanitizeTimelineSettings, type TimelineViewSettings } from "../graph/timelineSettings";
import { createTimelineAxis, extendTimelineAxis, timelineTimeToY, type TimelineAxisMap } from "./timeline-axis";
import { getTimelineAxisTicks } from "./timeline-ticks";
import { arrangeTimelineFlow } from "./timeline-flow";
import { assignTimelineChannels } from "./timeline-channels";
import { routeAroundTimelineObstacles, roundedTimelinePath } from "./timeline-routing";
import { packTimelineTrackLabels, timelineLabelBox } from "./timeline-labels";

const DAY = 86_400_000;
const TRACK_GAP = 79.2;

interface TimelineEntry {
  key: NodeKey;
  time: ParsedTimelineTime;
  track: string;
  lane: number;
  startY: number;
  endY: number;
}

/** One shared clock; horizontal arrangement is independent of temporal projection. */
export function buildTimelineStage(input: {
  dag: NormalizedDag;
  selection: GraphSelection | null;
  appearance?: StageAppearance;
  showNodeDetail?: boolean;
  now?: number;
  timeRange?: { start?: number; end?: number };
  timelineSettings?: Partial<TimelineViewSettings>;
  timelineAxis?: TimelineAxisMap;
  axisSource?: NormalizedDag;
  /** Null explicitly selects the unmodified algorithm; undefined reads saved mode. */
  arrangement?: TimelineLayoutPlan | null;
  nodeLabels?: Record<string, { width: number; displayTitle: string }>;
}): StageData | null {
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
    ...(arrangement?.nodeGap !== undefined ? { nodeGap: arrangement.nodeGap } : {}),
    ...(arrangement?.horizontalSpread !== undefined ? { horizontalSpread: arrangement.horizontalSpread } : {}),
    ...(arrangement?.edgeRouting ? { edgeRouting: arrangement.edgeRouting } : {}),
  });
  const clock = getTimelineClock(dag.metadata);
  const colorSource = Object.values((input.axisSource ?? dag).nodes);
  const typePalette = buildCategoryColorMap(colorSource.map(getNodeType));
  const trackPalette = buildCategoryColorMap(
    colorSource.map((node) =>
      settings.layout === "flow" ? getNodeType(node) || "Events" : String(node.track || "Events"),
    ),
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
  const theme = appearance.layout;
  const titleFont = { ...stageTitleFont(appearance), size: 13 };
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
  const labelWidth = Math.max(0, theme.maxNodeWidth);
  const labelStep = Math.max(showNodeDetail ? 60 : 44, theme.nodeHeight * 0.58 + theme.rowGap * 0.2);
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
  const top = Math.max(112, theme.stagePadding[1] + 32);
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
  const channelCounts = new Map<string, number>();
  if (!flow) {
    for (const track of tracks) {
      const events = dated.filter((entry) => entry.track === track);
      const positions = assignTimelineChannels({
        events: events.map((entry) => ({ key: entry.key, start: entry.startY, end: entry.endY })),
        edges: sourceEdges,
        minimum: 0,
        step: 1,
        order: arrangement?.eventOrder,
      });
      for (const event of events) event.lane = positions.get(event.key)!;
      channelCounts.set(track, Math.max(0, ...positions.values()) + 1);
    }
  }
  const nodeMap: Record<NodeKey, StageNode> = Object.create(null);
  const stageTracks: StageTimelineData["tracks"] = [];
  const axisX = 160;
  const pointSize = settings.pointMarker.visible ? settings.pointMarker.size : 0;
  const minimumCross = axisX + Math.max(54, Math.max(intervalWidth, pointSize) / 2 + 24);
  const markerWidth = Math.max(0, ...entries.map((entry) => (entry.time.kind === "range" ? intervalWidth : pointSize)));
  const channelStep = Math.max(markerWidth, (55.2 + settings.nodeGap) * Math.max(0, settings.horizontalSpread));
  // space is a one-based row/column index shared across tracks, not a pixel coordinate.
  const fixedPositions: Record<string, number> = Object.create(null);
  for (const entry of entries) {
    const space = dag.nodes[entry.key].space;
    if (typeof space === "number" && Number.isSafeInteger(space) && space >= 1)
      fixedPositions[entry.key] = minimumCross + (space - 1) * channelStep;
  }
  const fixedEntries = dated.filter((entry) => fixedPositions[entry.key] !== undefined);
  let trackX = Math.max(minimumCross, theme.stagePadding[0] + 120);
  let lastLabelBottom = axisMap ? axisMap.originY + axisMap.height : top;
  const topLevel = new Set(selection.topLevelKeys);
  const labelColumns = new Map<string, number>();
  for (const track of tracks) {
    const channelsWidth = ((channelCounts.get(track) || 1) - 1) * channelStep;
    const color = trackPalette.get(normalizeTypeLabel(track) ?? "")?.pinCore ?? "#64748b";
    const events = entries.filter((entry) => entry.track === track).sort(compareEntries);
    // Reserve explicit coordinates before placing automatic nodes, including other tracks' fixed events.
    const physicalPositions =
      !flow && Object.keys(fixedPositions).length
        ? assignTimelineChannels({
            events: [
              ...dated.filter((entry) => entry.track === track),
              ...fixedEntries.filter((entry) => entry.track !== track),
            ].map((entry) => ({ key: entry.key, start: entry.startY, end: entry.endY })),
            edges: sourceEdges,
            minimum: trackX + 10,
            step: channelStep,
            fixedPositions,
            order: arrangement?.eventOrder,
          })
        : undefined;
    const labelX = Math.max(
      trackX + channelsWidth + 32,
      ...events.map((event) => (physicalPositions?.get(event.key) ?? trackX) + 22),
    );
    labelColumns.set(track, labelX);
    for (const event of events) {
      const labelY = event.startY + 3;
      const x = physicalPositions?.get(event.key) ?? trackX + event.lane * channelStep + 10;
      nodeMap[event.key] = createNode(event, x, labelX, labelY, color);
    }
    const trackNodes = events.map((entry) => nodeMap[entry.key]);
    // Reserve a wider text column without changing the event label's own size.
    const textWidth =
      settings.orientation === "horizontal"
        ? Math.max(72, intervalWidth + 24)
        : Math.max(intervalWidth + 24, Math.max(...trackNodes.map((node) => node.width)) * 1.8 + 79.2);
    const width = Math.max(
      channelsWidth + markerWidth,
      Math.max(channelsWidth + textWidth * Math.max(1, settings.horizontalSpread), estimateTextWidth(track, 12) + 20) *
        Math.min(1, Math.max(0, settings.horizontalSpread)),
    );
    stageTracks.push({ id: track, label: track, x: trackX, width, color });
    if (!flow && settings.orientation !== "horizontal") {
      const datedNodes = trackNodes.filter((node) => node.timeline!.status === "dated");
      packTimelineTrackLabels(datedNodes, top + 3);
      for (const node of datedNodes) lastLabelBottom = Math.max(lastLabelBottom, timelineLabelBox(node).bottom);
    }
    trackX =
      (physicalPositions ? Math.max(trackX + width, labelX + textWidth) : trackX + width) +
      TRACK_GAP * settings.horizontalSpread;
  }
  let flowWidth = 0;
  if (flow) {
    const arranged = arrangeTimelineFlow({
      nodes: dated.map((entry) => nodeMap[entry.key]),
      edges: sourceEdges.filter((edge) => nodeMap[edge.source] && nodeMap[edge.target]),
      minimumX: minimumCross,
      gap: settings.nodeGap,
      spread: settings.horizontalSpread,
      pins: settings.pins,
      order: arrangement?.eventOrder,
      packLabels: settings.orientation !== "horizontal",
    });
    flowWidth = arranged.width;
    lastLabelBottom = Math.max(axisMap ? axisMap.originY + axisMap.height : top, arranged.bottom);
  }
  const undatedY = undated.length ? lastLabelBottom + 96 : null;
  if (undatedY !== null) {
    for (const track of stageTracks) {
      undated
        .filter((entry) => entry.track === track.id)
        .sort(compareEntries)
        .forEach((event, index) => {
          event.startY = undatedY + 48 + index * labelStep;
          event.endY = event.startY;
          nodeMap[event.key] = createNode(
            event,
            track.x + 10,
            labelColumns.get(track.id)!,
            event.startY + 3,
            track.color,
          );
          lastLabelBottom = Math.max(lastLabelBottom, event.startY + labelStep);
        });
    }
  }
  if (flow && undated.length) {
    const undatedNodes = undated.map((entry, index) => {
      const node = nodeMap[entry.key];
      node.y =
        node.timeline!.startY =
        node.timeline!.endY =
        node.timeline!.anchorY =
          undatedY! + 48 + index * labelStep;
      return node;
    });
    const arranged = arrangeTimelineFlow({
      nodes: undatedNodes,
      edges: sourceEdges.filter(
        (edge) =>
          undatedNodes.some((node) => node.key === edge.source) &&
          undatedNodes.some((node) => node.key === edge.target),
      ),
      minimumX: minimumCross,
      gap: settings.nodeGap,
      spread: settings.horizontalSpread,
      pins: settings.pins,
      order: arrangement?.eventOrder,
      packLabels: settings.orientation !== "horizontal",
    });
    flowWidth = Math.max(flowWidth, arranged.width);
    lastLabelBottom = Math.max(lastLabelBottom, arranged.bottom);
  }
  if (flow) stageTracks.length = 0;
  // Explicit rows can move events away from their allocated track.
  // Anchor guides and headings to the actual cross-axis extent.
  for (const track of stageTracks) {
    const members = Object.values(nodeMap).filter((node) => node.timeline!.track === track.id);
    if (!members.length) continue;
    const left = Math.min(...members.map((node) => node.x)) - 10;
    const right = Math.max(...members.map((node) => node.x + (node.timeline!.barWidth ?? 12) / 2));
    track.x = left;
    track.width = Math.max(track.width, right - left);
  }
  let stageWidth = Math.max(600, flow ? flowWidth : trackX - TRACK_GAP * settings.horizontalSpread + 64);
  let stageHeight = Math.max(360, lastLabelBottom + 80);
  const nodes = entries
    .slice()
    .sort(compareEntries)
    .map((entry) => nodeMap[entry.key]);
  for (const node of nodes) {
    stageWidth = Math.max(
      stageWidth,
      node.x + (node.timeline!.barWidth ?? 12) / 2 + 48,
      timelineLabelBox(node).right + 48,
    );
  }
  const edges = sourceEdges.map((edge, index) =>
    routeEdge(edge, index, nodeMap, stageTracks, axisMap, warnings, settings.edgeRouting),
  );
  for (const edge of edges)
    for (const point of edge.points ?? []) {
      stageWidth = Math.max(stageWidth, point.x + 40);
      stageHeight = Math.max(stageHeight, point.y + 40);
    }
  const connectedKeysByNode = new Map<NodeKey, Set<NodeKey>>(keys.map((key) => [key, new Set([key])]));
  sourceEdges.forEach((edge) => {
    connectedKeysByNode.get(edge.source)!.add(edge.target);
    connectedKeysByNode.get(edge.target)!.add(edge.source);
  });
  return orientTimelineStage(
    {
      dag: dag.nodes,
      layoutMode: "timeline",
      root: selection.rootKey,
      selection,
      topLevelKeys: selection.topLevelKeys,
      isForest: selection.isForest,
      nodeMap,
      nodes,
      edges,
      connectedKeysByNode,
      lanes: stageTracks.map((track, layer) => ({
        layer,
        label: track.label,
        x: track.x + track.width / 2,
        width: track.width,
      })),
      stageWidth,
      stageHeight,
      warnings,
      timeline: {
        clock,
        relativeTickStep: settings.relativeTickStep,
        layout: settings.layout,
        edgeRouting: settings.edgeRouting,
        axisMap,
        tickInterval,
        axisX,
        originY: axisMap?.originY ?? top,
        filtered: filtered || undefined,
        start,
        end,
        pixelsPerUnit: scale,
        ticks: axisMap
          ? getTimelineAxisTicks(
              axisMap,
              axisMap.originY,
              axisMap.originY + axisMap.height,
              1,
              tickInterval,
              clock,
              settings.relativeTickStep,
            )
          : [],
        tracks: stageTracks,
        undatedY,
        timeZone: relative ? null : "UTC",
      },
    },
    settings.orientation,
  );

  function createNode(entry: TimelineEntry, x: number, labelX: number, labelY: number, color: string): StageNode {
    const type = getNodeType(dag.nodes[entry.key]);
    const hasCustomColor =
      settings.colorBy === "type" &&
      Object.prototype.hasOwnProperty.call(settings.typeColors, type) &&
      Boolean(settings.typeColors[type]);
    const colorTokens = hasCustomColor
      ? undefined
      : settings.colorBy === "type"
        ? typePalette.get(normalizeTypeLabel(type) ?? "")
        : trackPalette.get(normalizeTypeLabel(entry.track) ?? "");
    if (settings.colorBy === "type") color = timelineTypeColor(type, settings.typeColors, typePalette);
    const visual = getNodeVisual(
      entry.key,
      dag.nodes[entry.key],
      theme.minNodeWidth,
      labelWidth,
      showNodeDetail,
      false,
      titleFont,
    );
    const time = entry.time;
    const space = dag.nodes[entry.key].space as number | undefined;
    if (space !== undefined) {
      x = fixedPositions[entry.key];
      labelX = x + 22;
    }
    const contentWidth =
      input.nodeLabels?.[entry.key]?.width ??
      (!showNodeDetail
        ? Math.min(labelWidth, Math.max(110, measureText(visual.title, titleFont) + 16, time.label.length * 6.1 + 12))
        : labelWidth);
    const inside = time.kind === "range" && settings.intervalTitle === "inside";
    const insideWidth = settings.orientation === "horizontal" ? entry.endY - entry.startY : intervalWidth;
    const displayTitle =
      input.nodeLabels?.[entry.key]?.displayTitle ??
      fitMeasuredText(visual.title, inside ? Math.max(0, insideWidth - 16) : contentWidth - 6, titleFont);
    const isDated = time.status === "dated";
    return {
      key: entry.key,
      layer: tracks.indexOf(entry.track),
      order: entry.lane,
      title: visual.title,
      displayTitle,
      detail: visual.detail,
      detailLines: showNodeDetail && visual.detail ? wrapDetailText(visual.detail, labelWidth, 1) : [],
      typeLabel: getNodeType(dag.nodes[entry.key]) || undefined,
      colorTokens,
      width: contentWidth,
      height: Math.max(36, entry.endY - entry.startY),
      isRoot: topLevel.has(entry.key),
      x,
      y: entry.startY,
      timeline: {
        intervalTitle: settings.intervalTitle,
        intervalAlign: settings.intervalAlign,
        intervalStyle: settings.intervalStyle,
        intervalBorder: settings.intervalBorder,
        intervalBorderWidth: settings.intervalBorderWidth,
        intervalBorderColor: settings.intervalBorderColor,
        intervalRadius: settings.intervalRadius,
        intervalTextColor: settings.intervalTextColor,
        intervalTextColorMode: settings.intervalTextColorMode,
        pointMarker: settings.pointMarker,
        anchorMarker: settings.anchorMarker,
        pointTextColor: settings.pointTextColor,
        pointDateVisible: settings.pointDateVisible,
        pointDateColor: settings.pointDateColor,
        leaderStyle: settings.leaderStyle,
        leaderColor: settings.leaderColor,
        leaderWidth: settings.leaderWidth,
        minimumCross,
        space,
        barWidth: time.kind === "range" ? intervalWidth : settings.pointMarker.visible ? settings.pointMarker.size : 0,
        status: time.status,
        kind: time.kind,
        start: isDated ? time.start : null,
        end: isDated ? time.end : null,
        clippedStart: (isDated && rangeStart !== undefined && time.start < rangeStart) || undefined,
        clippedEnd: (isDated && rangeEnd !== undefined && time.end > rangeEnd) || undefined,
        ongoing: isDated && time.ongoing,
        precision: isDated ? time.precision : null,
        track: entry.track,
        lane: entry.lane,
        startY: entry.startY,
        endY: entry.endY,
        anchorY: entry.startY,
        labelX,
        labelY,
        label: time.label,
        color,
        warning: isDated ? undefined : time.message,
      },
    };
  }
}

export function routeTimelineEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
  axis?: TimelineAxisMap,
  warnings: string[] = [],
  routing: TimelineViewSettings["edgeRouting"] = "avoid",
): StageEdge {
  return routeEdge(edge, index, nodes, tracks, axis, warnings, routing);
}

function routeEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
  axis?: TimelineAxisMap,
  warnings: string[] = [],
  routing: TimelineViewSettings["edgeRouting"] = "avoid",
): StageEdge {
  const source = nodes[edge.source];
  const target = nodes[edge.target];
  const relation = getTimelineRelation(edge.metadata, source.timeline?.precision === "relative");
  function anchor(node: StageNode, position: "start" | "end", time: number | undefined) {
    const data = node.timeline!;
    if (
      time !== undefined &&
      axis &&
      data.start !== null &&
      data.end !== null &&
      time >= data.start &&
      time <= data.end
    ) {
      const y = Math.max(data.startY, Math.min(data.endY, timelineTimeToY(axis, time)));
      if (!data.ports?.some((port) => port.time === time)) (data.ports ??= []).push({ time, y });
      return { time, y };
    }
    if (time !== undefined) warnings.push(`${edge.id}: time anchor outside ${node.key}; using ${position}.`);
    return { time: position === "end" ? data.end : data.start, y: position === "end" ? data.endY : data.startY };
  }
  const { time: sourceTime, y: sourceY } = anchor(source, relation.sourceAnchor, relation.sourceTime);
  const { time: targetTime, y: targetY } = anchor(target, relation.targetAnchor, relation.targetTime);
  const backward = sourceTime !== null && targetTime !== null && targetTime < sourceTime;
  const channel = 14 + (index % 5) * 4;
  const leftTrack = tracks.find((track) => track.id === (source.x < target.x ? source : target).timeline!.track);
  const points =
    routing === "direct"
      ? [
          { x: source.x, y: sourceY },
          { x: target.x, y: targetY },
        ]
      : timelineRoute(
          { x: source.x, y: sourceY },
          { x: target.x, y: targetY },
          Object.values(nodes).flatMap((node) => {
            const time = node.timeline!;
            const endpoint = node.key === source.key || node.key === target.key;
            // Endpoints are allowed, but a long duration body must not become an edge corridor.
            const top = time.startY + (endpoint ? 8 : -8);
            const bottom = time.endY + (endpoint ? -8 : 8);
            const boxes: RouteObstacle[] = [];
            if (top < bottom) {
              const cuts = [
                top,
                ...(node.key === source.key ? [sourceY - 10, sourceY + 10] : []),
                ...(node.key === target.key ? [targetY - 10, targetY + 10] : []),
                bottom,
              ]
                .filter((y) => y >= top && y <= bottom)
                .sort((a, b) => a - b);
              for (let i = 0; i < cuts.length - 1; i++) {
                const mid = (cuts[i] + cuts[i + 1]) / 2;
                if (
                  (node.key === source.key && Math.abs(mid - sourceY) < 10) ||
                  (node.key === target.key && Math.abs(mid - targetY) < 10)
                )
                  continue;
                boxes.push({
                  left: node.x - (time.barWidth ?? 12) / 2 - 2,
                  right: node.x + (time.barWidth ?? 12) / 2 + 2,
                  top: cuts[i],
                  bottom: cuts[i + 1],
                });
              }
            }
            return boxes;
          }),
          Math.max(180, (leftTrack?.x ?? Math.min(source.x, target.x)) - channel),
        );
  const path = roundedTimelinePath(points);
  const middle =
    points.length === 2
      ? { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 }
      : points[Math.floor(points.length / 2)];
  return {
    id: edge.id,
    originalEdgeIds: [edge.id],
    source: edge.source,
    target: edge.target,
    weight: edge.value,
    label: edge.value === undefined || edge.value === null || edge.value === 1 ? "" : String(edge.value),
    description: `${relation.kind}${backward ? " · points to an earlier time" : ""}`,
    path,
    points: points.map((point, order): StageRoutePoint => ({ ...point, layer: 0, order })),
    labelPosition: middle,
    timeline: { ...relation, backward, color: source.timeline!.color },
  };
}

type RoutePoint = { x: number; y: number };
type RouteObstacle = { left: number; right: number; top: number; bottom: number };

function timelineRoute(from: RoutePoint, to: RoutePoint, obstacles: RouteObstacle[], corridorX: number): RoutePoint[] {
  if (from.x === to.x && from.y === to.y) return [from, to];
  const minY = Math.min(from.y, to.y),
    maxY = Math.max(from.y, to.y);
  const minX = Math.min(from.x, to.x),
    maxX = Math.max(from.x, to.x);
  const close = maxY - minY < 24;
  const candidates: RoutePoint[][] = [];
  if (from.x === to.x || from.y === to.y) candidates.push([from, to]);
  if (from.x !== to.x) {
    const middleY = (from.y + to.y) / 2;
    const bend = Math.min(18, (maxY - minY) / 2);
    const crossingYs = new Set([middleY, minY + bend, maxY - bend]);
    // Dense, simultaneous milestones may need a small bridge over an intervening marker.
    // It stays between their lanes, instead of doubling back through a distant side corridor.
    for (const obstacle of obstacles) {
      if (obstacle.left >= maxX || obstacle.right <= minX) continue;
      for (const y of [obstacle.top - 6, obstacle.bottom + 6]) {
        if (y > minY - (close ? 24 : 0) && y < maxY + (close ? 24 : 0)) crossingYs.add(y);
      }
    }
    for (const y of [...crossingYs].sort((a, b) => Math.abs(a - middleY) - Math.abs(b - middleY))) {
      candidates.push([from, { x: from.x, y }, { x: to.x, y }, to]);
    }
    if (!close) {
      const middleX = (from.x + to.x) / 2;
      candidates.push([from, { x: middleX, y: from.y }, { x: middleX, y: to.y }, to]);
    }
  }
  if (!close || from.x === to.x) {
    // Horizontal exits preserve the time direction, including backward edges. Fixed +/-12
    // vertical offsets used to cross on short edges and draw spurious loops.
    candidates.push([from, { x: corridorX, y: from.y }, { x: corridorX, y: to.y }, to]);
  }
  let best = candidates[0],
    fewestCollisions = Infinity;
  for (const candidate of candidates) {
    const collisions = obstacles.filter((obstacle) =>
      candidate.slice(1).some((point, index) => segmentHitsObstacle(candidate[index], point, obstacle)),
    ).length;
    if (collisions === 0) return candidate;
    if (collisions < fewestCollisions) {
      best = candidate;
      fewestCollisions = collisions;
    }
  }
  return routeAroundTimelineObstacles(from, to, obstacles) ?? best;
}

function segmentHitsObstacle(a: RoutePoint, b: RoutePoint, obstacle: RouteObstacle): boolean {
  // Clip each orthogonal segment against the obstacle bounds.
  let enter = 0,
    leave = 1;
  for (const [start, delta, low, high] of [
    [a.x, b.x - a.x, obstacle.left, obstacle.right],
    [a.y, b.y - a.y, obstacle.top, obstacle.bottom],
  ]) {
    if (delta === 0) {
      if (start < low || start > high) return false;
    } else {
      const first = (low - start) / delta,
        last = (high - start) / delta;
      enter = Math.max(enter, Math.min(first, last));
      leave = Math.min(leave, Math.max(first, last));
      if (enter > leave) return false;
    }
  }
  return true;
}

function compareKeys(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
function compareEntries(a: TimelineEntry, b: TimelineEntry): number {
  const aTime = a.time.status === "dated" ? a.time.start : Infinity;
  const bTime = b.time.status === "dated" ? b.time.start : Infinity;
  return aTime - bTime || compareKeys(a.key, b.key);
}
