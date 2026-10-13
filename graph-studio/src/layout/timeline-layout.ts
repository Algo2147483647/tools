import { getNodeType } from "../graph/accessors";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { getTimelineRelation, parseNodeTimeline, parseTimelineDate, type ParsedTimelineTime } from "../graph/timeline";
import { collectDescendantKeys } from "../graph/traversal";
import type { GraphEdge, GraphSelection, NodeKey, NormalizedDag } from "../graph/types";
import type { StageAppearance } from "./appearance";
import { resolveStageSelection } from "./selection";
import { getNodeVisual, truncateTitleToWidth, wrapDetailText } from "./text";
import type { StageData, StageEdge, StageNode, StageRoutePoint, StageTimelineData } from "./types";

const DAY = 86_400_000;
const CHANNEL_GAP = 18;
const MARKER_CLEARANCE = 16;
const TRACK_GAP = 44;

interface TimelineEntry {
  key: NodeKey;
  time: ParsedTimelineTime;
  track: string;
  lane: number;
  startY: number;
  endY: number;
}

/** A linear UTC axis. Compact marker channels allow long programs and nested events to coexist. */
export function buildTimelineStage(input: {
  dag: NormalizedDag;
  selection: GraphSelection | null;
  appearance?: StageAppearance;
  showNodeDetail?: boolean;
  now?: number;
  timeRange?: { start?: number; end?: number };
}): StageData | null {
  const { dag, appearance = DEFAULT_GRAPH_APPEARANCE, showNodeDetail = false } = input;
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
    track:
      typeof dag.nodes[key].track === "string" && String(dag.nodes[key].track).trim()
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
  const timestamps = dated.flatMap((entry) =>
    entry.time.status === "dated" ? [entry.time.start, entry.time.end] : [],
  );
  let start = rangeStart ?? (timestamps.length ? Math.min(...timestamps) : null);
  let end = rangeEnd ?? (timestamps.length ? Math.max(...timestamps) : null);
  if (!filtered && start !== null && end === start) {
    start -= DAY / 2;
    end += DAY / 2;
  }
  const labelWidth = Math.max(140, Math.min(480, theme.maxNodeWidth));
  const labelStep = Math.max(showNodeDetail ? 60 : 44, theme.nodeHeight * 0.58 + theme.rowGap * 0.2);
  const largestTrack = Math.max(...tracks.map((track) => dated.filter((entry) => entry.track === track).length), 1);
  const timelineHeight = dated.length ? Math.max(900, Math.min(10_000, largestTrack * labelStep * 1.45)) : 0;
  const top = Math.max(112, theme.stagePaddingY + 32);
  const scale = start !== null && end !== null ? timelineHeight / (end === start ? DAY : end - start) : 0;
  const yAt = (time: number) => top + (time - (start ?? time)) * scale;
  dated.forEach((entry) => {
    if (entry.time.status === "dated") {
      entry.startY = yAt(Math.max(entry.time.start, rangeStart ?? -Infinity));
      entry.endY = yAt(Math.min(entry.time.end, rangeEnd ?? Infinity));
    }
  });
  const entryMap = new Map(entries.map((entry) => [entry.key, entry]));
  const incoming = new Map<string, GraphEdge[]>();
  const outgoing = new Map<string, GraphEdge[]>();
  sourceEdges.forEach((edge) => {
    if (["reference", "part-of"].includes(getTimelineRelation(edge.metadata).kind)) return;
    incoming.set(edge.target, [...(incoming.get(edge.target) || []), edge]);
    outgoing.set(edge.source, [...(outgoing.get(edge.source) || []), edge]);
  });
  outgoing.forEach((edges) => edges.sort((a, b) => compareEntries(entryMap.get(a.target)!, entryMap.get(b.target)!)));
  const channelCounts = new Map<string, number>();
  for (const track of tracks) {
    const events = dated.filter((entry) => entry.track === track).sort(compareEntries);
    const occupiedUntil: number[] = [];
    const assigned = new Set<string>();
    for (const event of events) {
      const parents = (incoming.get(event.key) || [])
        .map((edge) => entryMap.get(edge.source)!)
        .filter((parent) => parent.track === track && assigned.has(parent.key))
        .sort((a, b) => b.startY - a.startY || compareKeys(a.key, b.key));
      // At a merge, return to the earliest established channel rather than following the latest branch.
      const parent =
        parents.length > 1 ? parents.slice().sort((a, b) => a.lane - b.lane || b.startY - a.startY)[0] : parents[0];
      const primaryChild = parent ? outgoing.get(parent.key)?.[0]?.target === event.key : true;
      const preferred = parent ? parent.lane + (primaryChild ? 0 : 1) : 0;
      const available = occupiedUntil
        .map((until, index) => ({ until, index }))
        .filter(({ until }) => until <= event.startY)
        .sort((a, b) => Math.abs(a.index - preferred) - Math.abs(b.index - preferred) || a.index - b.index);
      let lane =
        occupiedUntil[preferred] === undefined || occupiedUntil[preferred] <= event.startY
          ? preferred
          : (available[0]?.index ?? occupiedUntil.length);
      // Do not create empty channels just because a preferred branch channel has a high index.
      lane = Math.min(lane, occupiedUntil.length);
      event.lane = lane;
      occupiedUntil[lane] = Math.max(event.endY, event.startY) + MARKER_CLEARANCE;
      assigned.add(event.key);
    }
    channelCounts.set(track, Math.max(1, occupiedUntil.length));
  }
  const nodeMap: Record<NodeKey, StageNode> = Object.create(null);
  const stageTracks: StageTimelineData["tracks"] = [];
  const axisX = 160;
  let trackX = Math.max(axisX + 54, theme.stagePaddingX + 120);
  let lastLabelBottom = top + timelineHeight;
  const topLevel = new Set(selection.topLevelKeys);
  for (const track of tracks) {
    const channelsWidth = ((channelCounts.get(track) || 1) - 1) * CHANNEL_GAP;
    const width = channelsWidth + labelWidth + 44;
    const color = trackColor(track);
    stageTracks.push({ id: track, label: track, x: trackX, width, color });
    const labelX = trackX + channelsWidth + 32;
    let previousLabelY = top - labelStep;
    for (const event of dated.filter((entry) => entry.track === track).sort(compareEntries)) {
      const labelY = Math.max(event.startY + 3, previousLabelY + labelStep);
      previousLabelY = labelY;
      lastLabelBottom = Math.max(lastLabelBottom, labelY + labelStep);
      nodeMap[event.key] = createNode(event, trackX + event.lane * CHANNEL_GAP + 10, labelX, labelY, color);
    }
    trackX += width + TRACK_GAP;
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
            track.x + (channelCounts.get(track.id)! - 1) * CHANNEL_GAP + 32,
            event.startY + 3,
            track.color,
          );
          lastLabelBottom = Math.max(lastLabelBottom, event.startY + labelStep);
        });
    }
  }
  const stageWidth = Math.max(600, trackX - TRACK_GAP + 64);
  const stageHeight = Math.max(360, lastLabelBottom + 80);
  const nodes = entries
    .slice()
    .sort(compareEntries)
    .map((entry) => nodeMap[entry.key]);
  const edges = sourceEdges.map((edge, index) => routeEdge(edge, index, nodeMap, stageTracks));
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
      axisX,
      originY: top,
      filtered: filtered || undefined,
      start,
      end,
      pixelsPerMillisecond: scale,
      ticks: start !== null && end !== null ? buildTimelineTicks(start, end, yAt) : [],
      tracks: stageTracks,
      undatedY,
      timeZone: "UTC",
    },
  };

  function createNode(entry: TimelineEntry, x: number, labelX: number, labelY: number, color: string): StageNode {
    const visual = getNodeVisual(entry.key, dag.nodes[entry.key], theme.minNodeWidth, labelWidth, showNodeDetail);
    const time = entry.time;
    const isDated = time.status === "dated";
    return {
      key: entry.key,
      layer: tracks.indexOf(entry.track),
      order: entry.lane,
      title: visual.title,
      displayTitle: truncateTitleToWidth(visual.title, labelWidth + 58),
      detail: visual.detail,
      detailLines: showNodeDetail && visual.detail ? wrapDetailText(visual.detail, labelWidth, 1) : [],
      typeLabel: getNodeType(dag.nodes[entry.key]) || undefined,
      width: labelWidth,
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

function routeEdge(
  edge: GraphEdge,
  index: number,
  nodes: Record<string, StageNode>,
  tracks: StageTimelineData["tracks"],
): StageEdge {
  const source = nodes[edge.source];
  const target = nodes[edge.target];
  const relation = getTimelineRelation(edge.metadata);
  const sourceY = relation.sourceAnchor === "end" ? source.timeline!.endY : source.timeline!.startY;
  const targetY = relation.targetAnchor === "end" ? target.timeline!.endY : target.timeline!.startY;
  const sourceTime = relation.sourceAnchor === "end" ? source.timeline!.end : source.timeline!.start;
  const targetTime = relation.targetAnchor === "end" ? target.timeline!.end : target.timeline!.start;
  const backward = sourceTime !== null && targetTime !== null && targetTime < sourceTime;
  const channel = 14 + (index % 5) * 4;
  const leftTrack = tracks.find((track) => track.id === (source.x < target.x ? source : target).timeline!.track)!;
  const points = timelineRoute(
    { x: source.x, y: sourceY },
    { x: target.x, y: targetY },
    Object.values(nodes).flatMap((node) => {
      const time = node.timeline!;
      const endpoint = node.key === source.key || node.key === target.key;
      // Endpoints are allowed, but a long duration body must not become an edge corridor.
      const top = time.startY + (endpoint ? 8 : -8);
      const bottom = time.endY + (endpoint ? -8 : 8);
      return top < bottom ? [{ left: node.x - 8, right: node.x + 8, top, bottom }] : [];
    }),
    Math.max(118, leftTrack.x - channel),
  );
  const path = roundedRoute(points);
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
  if (from.x === to.x || close) candidates.push([from, to]);
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
  return best;
}

function segmentHitsObstacle(a: RoutePoint, b: RoutePoint, obstacle: RouteObstacle): boolean {
  // Clip the segment against both rectangle axes, also handling subpixel diagonal edges.
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

function roundedRoute(points: { x: number; y: number }[]): string {
  points = points.filter(
    (point, index) => !index || point.x !== points[index - 1].x || point.y !== points[index - 1].y,
  );
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let index = 1; index < points.length - 1; index++) {
    const previous = points[index - 1],
      point = points[index],
      next = points[index + 1];
    const before = Math.hypot(point.x - previous.x, point.y - previous.y);
    const after = Math.hypot(next.x - point.x, next.y - point.y);
    if (!before || !after) {
      path += ` L ${point.x} ${point.y}`;
      continue;
    }
    const radius = Math.min(12, before / 2, after / 2);
    const ax = point.x + ((previous.x - point.x) * radius) / before,
      ay = point.y + ((previous.y - point.y) * radius) / before;
    const bx = point.x + ((next.x - point.x) * radius) / after,
      by = point.y + ((next.y - point.y) * radius) / after;
    path += ` L ${ax} ${ay} Q ${point.x} ${point.y} ${bx} ${by}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
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

/** Calendar-aligned ticks also work for leap years, month boundaries and multi-decade views. */
export function buildTimelineTicks(
  start: number,
  end: number,
  yAt: (time: number) => number,
): StageTimelineData["ticks"] {
  if (start === end) return [{ time: start, y: yAt(start), label: formatTick(start, DAY) }];
  const span = end - start;
  const count = Math.max(4, Math.min(100, Math.floor(Math.abs(yAt(end) - yAt(start)) / 100)));
  const desired = span / count;
  const fixedSteps = [
    1000,
    5000,
    15_000,
    30_000,
    60_000,
    300_000,
    900_000,
    1_800_000,
    3_600_000,
    10_800_000,
    21_600_000,
    43_200_000,
    DAY,
    2 * DAY,
    7 * DAY,
    14 * DAY,
  ];
  const fixed = fixedSteps.find((step) => step >= desired);
  const times: number[] = [];
  if (fixed) {
    for (let time = Math.ceil(start / fixed) * fixed; time <= end && times.length < 200; time += fixed)
      times.push(time);
  } else {
    const months = desired < 90 * DAY ? 1 : desired < 180 * DAY ? 3 : desired < 365 * DAY ? 6 : 12;
    const years =
      months === 12
        ? [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000].find((step) => step * 365.2425 * DAY >= desired) || 1000
        : 1;
    const date = new Date(start);
    date.setUTCFullYear(
      Math.floor(date.getUTCFullYear() / years) * years,
      Math.floor(date.getUTCMonth() / months) * months,
      1,
    );
    date.setUTCHours(0, 0, 0, 0);
    while (date.getTime() <= end && times.length < 200) {
      if (date.getTime() >= start) times.push(date.getTime());
      date.setUTCMonth(date.getUTCMonth() + months * years);
    }
  }
  if (!times.length) times.push(start, end);
  return times.map((time) => ({ time, y: yAt(time), label: formatTick(time, desired) }));
}

function formatTick(time: number, step: number): string {
  const iso = new Date(time).toISOString();
  if (step >= 300 * DAY) return iso.slice(0, 4);
  if (step >= 28 * DAY) return iso.slice(0, 7);
  if (step >= DAY) return iso.slice(0, 10);
  return `${iso.slice(0, 10)} ${iso.slice(11, step < 60_000 ? 19 : 16)}`;
}
