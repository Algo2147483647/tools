import { getNodeType } from "../graph/accessors";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getTimelineRelation, parseNodeTimeline, parseTimelineDate, type ParsedTimelineTime } from "../graph/timeline";
import { collectDescendantKeys } from "../graph/traversal";
import type { GraphEdge, GraphSelection, NodeKey, NormalizedDag } from "../graph/types";
import { stageTitleFont, type StageAppearance } from "./appearance";
import { resolveStageSelection } from "./selection";
import { estimateTextWidth, getNodeVisual, wrapDetailText, measureText, fitMeasuredText } from "./text";
import type { StageData, StageEdge, StageNode, StageRoutePoint, StageTimelineData } from "./types";
import {
  getDocumentTimelineSettings,
  sanitizeTimelineSettings,
  type TimelineViewSettings,
} from "../graph/timelineSettings";
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
}): StageData | null {
  const { dag, appearance = DEFAULT_GRAPH_APPEARANCE, showNodeDetail = false } = input;
  const settings = sanitizeTimelineSettings({
    ...getDocumentTimelineSettings(dag.metadata),
    ...input.timelineSettings,
  });
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
    value === undefined || (Number.isFinite(value) && Math.abs(value) <= 8.64e15);
  if (
    !isValidBound(rangeStart) ||
    !isValidBound(rangeEnd) ||
    (rangeStart !== undefined && rangeEnd !== undefined && rangeStart > rangeEnd)
  )
    return null;
  const filtered = rangeStart !== undefined || rangeEnd !== undefined;
  const theme = appearance.layout;
  const titleFont = { ...stageTitleFont(appearance), size: 13, style: "normal" };
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
  const now = input.now ?? asOf ?? Date.now();
  const selectedEntries: TimelineEntry[] = selectedKeys.map((key) => ({
    key,
    time: parseNodeTimeline(dag.nodes[key], now),
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
  const tracks = [...trackStartTimes.keys()].sort(
    (a, b) => trackStartTimes.get(a)! - trackStartTimes.get(b)! || compareKeys(a, b),
  );
  const dated = entries.filter((entry) => entry.time.status === "dated");
  const undated = entries.filter((entry) => entry.time.status !== "dated");
  const axisEntries = input.axisSource
    ? Object.values(input.axisSource.nodes).map((node) => parseNodeTimeline(node, now))
    : dated.map((entry) => entry.time);
  const timestamps = axisEntries.flatMap((time) =>
    time.status === "dated" ? (time.start === time.end ? [time.start] : [time.start, time.end]) : [],
  );
  for (const edge of (input.axisSource ?? dag).edges) {
    const relation = getTimelineRelation(edge.metadata);
    for (const [key, time] of [
      [edge.source, relation.sourceTime],
      [edge.target, relation.targetTime],
    ] as const) {
      if (time === undefined) continue;
      const node = (input.axisSource ?? dag).nodes[key];
      const parsed = node && parseNodeTimeline(node, now);
      if (parsed?.status === "dated" && time >= parsed.start && time <= parsed.end) timestamps.push(time);
    }
  }
  let start = rangeStart ?? (timestamps.length ? Math.min(...timestamps) : null);
  let end = rangeEnd ?? (timestamps.length ? Math.max(...timestamps) : null);
  if (!filtered && start !== null && end === start) {
    start -= DAY / 2;
    end += DAY / 2;
  }
  const labelWidth = Math.max(0, theme.maxNodeWidth);
  const labelStep = Math.max(showNodeDetail ? 60 : 44, theme.nodeHeight * 0.58 + theme.rowGap * 0.2);
  const trackCounts = new Map<string, number>();
  for (const node of Object.values(input.axisSource?.nodes ?? dag.nodes)) {
    if (parseNodeTimeline(node, now).status !== "dated") continue;
    const track = typeof node.track === "string" && node.track.trim() ? node.track.trim() : "Events";
    trackCounts.set(track, (trackCounts.get(track) ?? 0) + 1);
  }
  const demand = !flow && settings.axis === "linear" ? Math.max(1, ...trackCounts.values()) : new Set(timestamps).size;
  const timelineHeight = timestamps.length
    ? Math.max(900, Math.min(!flow && settings.axis === "linear" ? 10_000 : 24_000, demand * labelStep * 1.45))
    : 0;
  const top = Math.max(112, theme.stagePaddingY + 32);
  const axisMap =
    start !== null && end !== null
      ? input.timelineAxis && input.timelineAxis.mode === settings.axis
        ? extendTimelineAxis(input.timelineAxis, start, end, top)
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
  const scale = axisMap ? axisMap.height / (axisMap.end - axisMap.start || DAY) : 0;
  const yAt = (time: number) => (axisMap ? timelineTimeToY(axisMap, time) : top);
  const tickInterval =
    settings.axis === "linear" && settings.tickUnit !== "auto"
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
      });
      for (const event of events) event.lane = positions.get(event.key)!;
      channelCounts.set(track, Math.max(0, ...positions.values()) + 1);
    }
  }
  const nodeMap: Record<NodeKey, StageNode> = Object.create(null);
  const stageTracks: StageTimelineData["tracks"] = [];
  const axisX = 160;
  let trackX = Math.max(axisX + 54, theme.stagePaddingX + 120);
  let lastLabelBottom = axisMap ? axisMap.originY + axisMap.height : top;
  const topLevel = new Set(selection.topLevelKeys);
  const labelColumns = new Map<string, number>();
  for (const track of tracks) {
    const channelStep = (55.2 + settings.nodeGap) * settings.horizontalSpread;
    const channelsWidth = ((channelCounts.get(track) || 1) - 1) * channelStep;
    const color = trackColor(track);
    const events = entries.filter((entry) => entry.track === track).sort(compareEntries);
    const labelX = trackX + channelsWidth + 32;
    labelColumns.set(track, labelX);
    for (const event of events) {
      const labelY = event.startY + 3;
      const x = trackX + event.lane * channelStep + 10;
      nodeMap[event.key] = createNode(event, x, labelX, labelY, color);
    }
    const trackNodes = events.map((entry) => nodeMap[entry.key]);
    // Reserve a wider text column without changing the event label's own size.
    const textWidth = Math.max(...trackNodes.map((node) => node.width)) * 1.8 + 79.2;
    const width = Math.max(
      channelsWidth + textWidth * Math.max(1, settings.horizontalSpread),
      estimateTextWidth(track, 12) + 20,
    );
    stageTracks.push({ id: track, label: track, x: trackX, width, color });
    if (!flow) {
      const datedNodes = trackNodes.filter((node) => node.timeline!.status === "dated");
      packTimelineTrackLabels(datedNodes, top + 3);
      for (const node of datedNodes) lastLabelBottom = Math.max(lastLabelBottom, timelineLabelBox(node).bottom);
    }
    trackX += width + TRACK_GAP * settings.horizontalSpread;
  }
  let flowWidth = 0;
  if (flow) {
    const arranged = arrangeTimelineFlow({
      nodes: dated.map((entry) => nodeMap[entry.key]),
      edges: sourceEdges.filter((edge) => nodeMap[edge.source] && nodeMap[edge.target]),
      minimumX: axisX + 54,
      gap: settings.nodeGap,
      spread: settings.horizontalSpread,
      pins: settings.pins,
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
      minimumX: axisX + 54,
      gap: settings.nodeGap,
      spread: settings.horizontalSpread,
      pins: settings.pins,
    });
    flowWidth = Math.max(flowWidth, arranged.width);
    lastLabelBottom = Math.max(lastLabelBottom, arranged.bottom);
  }
  if (flow) stageTracks.length = 0;
  let stageWidth = Math.max(600, flow ? flowWidth : trackX - TRACK_GAP * settings.horizontalSpread + 64);
  let stageHeight = Math.max(360, lastLabelBottom + 80);
  const nodes = entries
    .slice()
    .sort(compareEntries)
    .map((entry) => nodeMap[entry.key]);
  const edges = sourceEdges.map((edge, index) => routeEdge(edge, index, nodeMap, stageTracks, axisMap, warnings));
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
  return {
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
      layout: settings.layout,
      axisMap,
      tickInterval,
      axisX,
      originY: axisMap?.originY ?? top,
      filtered: filtered || undefined,
      start,
      end,
      pixelsPerMillisecond: scale,
      ticks: axisMap
        ? getTimelineAxisTicks(axisMap, axisMap.originY, axisMap.originY + axisMap.height, 1, tickInterval)
        : [],
      tracks: stageTracks,
      undatedY,
      timeZone: "UTC",
    },
  };

  function createNode(entry: TimelineEntry, x: number, labelX: number, labelY: number, color: string): StageNode {
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
    const contentWidth = !showNodeDetail
      ? Math.min(labelWidth, Math.max(110, measureText(visual.title, titleFont) + 16, time.label.length * 6.1 + 12))
      : labelWidth;
    const displayTitle = fitMeasuredText(visual.title, contentWidth - 6, titleFont);
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
      width: contentWidth,
      height: Math.max(36, entry.endY - entry.startY),
      isRoot: topLevel.has(entry.key),
      x,
      y: entry.startY,
      timeline: {
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
): StageEdge {
  return routeEdge(edge, index, nodes, tracks, axis, warnings);
}

function routeEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
  axis?: TimelineAxisMap,
  warnings: string[] = [],
): StageEdge {
  const source = nodes[edge.source];
  const target = nodes[edge.target];
  const relation = getTimelineRelation(edge.metadata);
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
  const points = timelineRoute(
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
          boxes.push({ left: node.x - 8, right: node.x + 8, top: cuts[i], bottom: cuts[i + 1] });
        }
      }
      return boxes;
    }),
    Math.max(180, (leftTrack?.x ?? Math.min(source.x, target.x)) - channel),
  );
  const path = roundedTimelinePath(points);
  const middle = points[Math.floor(points.length / 2)];
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
function trackColor(track: string): string {
  let hash = 0;
  for (const character of track) hash = (hash * 31 + character.charCodeAt(0)) | 0;
  return `hsl(${((hash % 360) + 360) % 360} 58% 43%)`;
}
