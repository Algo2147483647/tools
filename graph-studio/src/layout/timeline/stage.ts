import type { NodeKey } from "../../graph/types";
import type { StageData } from "../shared/types";
import { TRACK_GAP, type TimelineArrangement } from "./arrange";
import { routeTimelineEdge } from "./edge-routing";
import { timelineLabelBox } from "./labels";
import { compareEntries } from "./ordering";
import { orientTimelineStage } from "./orientation";
import type { PreparedTimeline } from "./prepare";
import { getTimelineAxisTicks } from "./ticks";
export function assembleTimelineStage(context: PreparedTimeline, arrangement: TimelineArrangement): StageData {
  const {
    dag,
    appearance,
    settings,
    clock,
    relative,
    flow,
    filtered,
    theme,
    selection,
    entries,
    keys,
    sourceEdges,
    warnings,
    start,
    end,
    top,
    axisMap,
    scale,
    tickInterval,
  } = context;
  const { nodeMap, stageTracks, axisX, trackX, lastLabelBottom, flowWidth, undatedY } = arrangement;
  let stageWidth = Math.max(600, flow ? flowWidth : trackX - TRACK_GAP * appearance.nodes.spread + 64);
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
    routeTimelineEdge(edge, index, nodeMap, stageTracks, axisMap, warnings, settings.edgeRouting),
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
  const stage = orientTimelineStage(
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
  stage.stageWidth = Math.max(stage.stageWidth, theme.canvas.minSize[0]);
  stage.stageHeight = Math.max(stage.stageHeight, theme.canvas.minSize[1]);
  return stage;
}
