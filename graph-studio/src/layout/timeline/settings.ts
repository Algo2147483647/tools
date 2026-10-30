import type { TimelineViewSettings } from "../../schema/appearance/types";
import { resolveTimeline } from "../../schema/appearance/contract";

/** Paint-only values are supplied by the scene painter; geometry uses neutral defaults. */
export function timelineGeometrySettings(settings: TimelineViewSettings): TimelineViewSettings {
  const defaults = resolveTimeline(undefined);
  return {
    ...settings,
    colorBy: defaults.colorBy,
    typeColors: defaults.typeColors,
    intervalStyle: defaults.intervalStyle,
    intervalBorder: defaults.intervalBorder,
    intervalBorderColor: defaults.intervalBorderColor,
    intervalRadius: defaults.intervalRadius,
    intervalTextColor: defaults.intervalTextColor,
    intervalTextColorMode: defaults.intervalTextColorMode,
    pointTextColor: defaults.pointTextColor,
    pointDateColor: defaults.pointDateColor,
    leaderStyle: defaults.leaderStyle,
    leaderColor: defaults.leaderColor,
    pointMarker: {
      ...settings.pointMarker,
      fill: defaults.pointMarker.fill,
      borderColor: defaults.pointMarker.borderColor,
    },
    anchorMarker: {
      ...settings.anchorMarker,
      fill: defaults.anchorMarker.fill,
      borderColor: defaults.anchorMarker.borderColor,
    },
  };
}
