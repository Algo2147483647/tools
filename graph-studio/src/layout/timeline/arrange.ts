import { normalizeTypeLabel } from "../../graph/categoryColors";
import type { NodeKey } from "../../graph/types";
import { estimateTextWidth } from "../shared/text";
import type { StageNode, StageTimelineData } from "../shared/types";
import { assignTimelineChannels } from "./channels";
import { arrangeTimelineFlow } from "./flow";
import { packTimelineTrackLabels, timelineLabelBox } from "./labels";
import { createTimelineNodeFactory } from "./nodes";
import { compareEntries } from "./ordering";
import type { PreparedTimeline } from "./prepare";
export const TRACK_GAP = 79.2;
export function arrangeTimelineNodes(context: PreparedTimeline) {
  const {
    dag,
    appearance,
    settings,
    trackPalette,
    intervalWidth,
    flow,
    theme,
    selection,
    entries,
    sourceEdges,
    tracks,
    dated,
    undated,
    labelStep,
    top,
    axisMap,
  } = context;
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
  const pointSize = settings.pointMarker.visible ? settings.pointMarker.size : 0;
  const minimumCross = axisX + Math.max(54, Math.max(intervalWidth, pointSize) / 2 + 24);
  const markerWidth = Math.max(0, ...entries.map((entry) => (entry.time.kind === "range" ? intervalWidth : pointSize)));
  const channelStep = Math.max(
    markerWidth,
    (55.2 + appearance.nodes.spacing.channel) * Math.max(0, appearance.nodes.spread),
  );
  // space is a one-based row/column index shared across tracks, not a pixel coordinate.
  const fixedPositions: Record<string, number> = Object.create(null);
  for (const entry of entries) {
    const space = dag.nodes[entry.key].space;
    if (typeof space === "number" && Number.isSafeInteger(space) && space >= 1)
      fixedPositions[entry.key] = minimumCross + (space - 1) * channelStep;
  }
  const fixedEntries = dated.filter((entry) => fixedPositions[entry.key] !== undefined);
  let trackX = Math.max(minimumCross, theme.canvas.padding[0] + 120);
  let lastLabelBottom = axisMap ? axisMap.originY + axisMap.height : top;
  const topLevel = new Set(selection.topLevelKeys);
  const createNode = createTimelineNodeFactory({ ...context, fixedPositions, topLevel, minimumCross });
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
      Math.max(channelsWidth + textWidth * Math.max(1, appearance.nodes.spread), estimateTextWidth(track, 12) + 20) *
        Math.min(1, Math.max(0, appearance.nodes.spread)),
    );
    stageTracks.push({ id: track, label: track, x: trackX, width, color });
    if (!flow && settings.orientation !== "horizontal") {
      const datedNodes = trackNodes.filter((node) => node.timeline!.status === "dated");
      packTimelineTrackLabels(datedNodes, top + 3);
      for (const node of datedNodes) lastLabelBottom = Math.max(lastLabelBottom, timelineLabelBox(node).bottom);
    }
    trackX =
      (physicalPositions ? Math.max(trackX + width, labelX + textWidth) : trackX + width) +
      TRACK_GAP * appearance.nodes.spread;
  }
  let flowWidth = 0;
  if (flow) {
    const arranged = arrangeTimelineFlow({
      nodes: dated.map((entry) => nodeMap[entry.key]),
      edges: sourceEdges.filter((edge) => nodeMap[edge.source] && nodeMap[edge.target]),
      minimumX: minimumCross,
      gap: appearance.nodes.spacing.channel,
      spread: appearance.nodes.spread,
      pins: settings.pins,
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
      gap: appearance.nodes.spacing.channel,
      spread: appearance.nodes.spread,
      pins: settings.pins,
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

  return { nodeMap, stageTracks, axisX, trackX, lastLabelBottom, flowWidth, undatedY };
}
export type TimelineArrangement = ReturnType<typeof arrangeTimelineNodes>;
