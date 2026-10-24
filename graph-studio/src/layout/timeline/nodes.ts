import { getNodeType } from "../../graph/accessors";
import { normalizeTypeLabel } from "../../graph/categoryColors";
import { timelineTypeColor } from "../../graph/timelineColors";
import { fitMeasuredText, getNodeVisual, measureText } from "../shared/text";
import type { StageNode } from "../shared/types";
import type { TimelineEntry } from "./input-types";
import type { PreparedTimeline } from "./prepare";
export function createTimelineNodeFactory(
  context: PreparedTimeline & { fixedPositions: Record<string, number>; topLevel: Set<string>; minimumCross: number },
) {
  const {
    input,
    dag,
    showNodeDetail,
    settings,
    typePalette,
    trackPalette,
    intervalWidth,
    rangeStart,
    rangeEnd,
    theme,
    titleFont,
    dateFont,
    detailFont,
    labelMetrics,
    tracks,
    labelWidth,
    fixedPositions,
    topLevel,
    minimumCross,
  } = context;
  return createNode;
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
      [theme.nodes.widths[0], labelWidth],
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
        ? Math.min(
            labelWidth,
            Math.max(110, measureText(visual.title, titleFont) + 16, measureText(time.label, dateFont) + 12),
          )
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
      detailLines: showNodeDetail && visual.detail ? [fitMeasuredText(visual.detail, labelWidth, detailFont)] : [],
      typeLabel: getNodeType(dag.nodes[entry.key]) || undefined,
      colorTokens,
      width: contentWidth,
      height: Math.max(36, entry.endY - entry.startY),
      isRoot: topLevel.has(entry.key),
      x,
      y: entry.startY,
      timeline: {
        labelMetrics,
        displayDate: fitMeasuredText(time.label, contentWidth, dateFont),
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
