import { buildCategoryColorMap, normalizeTypeLabel } from "../../graph/categoryColors";
import { getNodeType } from "../../graph/accessors";
import { timelineTypeColor } from "../../graph/timeline/colors";
import type { NormalizedDag } from "../../graph/types";
import type { GraphAppearance, TimelineViewSettings } from "../../schema/appearance/types";
import type { StageData } from "../../layout/shared/types";

/** Pure paint pass. Coordinates, paths and measured sizes are never changed here. */
export function paintScene(
  scene: StageData,
  source: NormalizedDag,
  appearance: GraphAppearance,
  settings?: TimelineViewSettings,
): StageData {
  const categories = appearance.palette.categories;
  const types = buildCategoryColorMap(Object.values(source.nodes).map(getNodeType), categories);
  const tracks = buildCategoryColorMap(
    Object.values(source.nodes).map((n) =>
      settings?.layout === "flow" ? getNodeType(n) || "Events" : String(n.track || "Events"),
    ),
    categories,
  );
  const flows = buildCategoryColorMap(
    scene.nodes.map((n) => String(source.nodes[n.key]?.type || n.key)),
    categories,
  );
  const nodes = scene.nodes.map((node) => {
    const raw = source.nodes[node.key];
    if (!raw) return node;
    const type = getNodeType(raw),
      tokens = types.get(normalizeTypeLabel(type) ?? "");
    if (node.spatial) {
      const custom = raw.spatialStyle as { color?: string } | undefined;
      return {
        ...node,
        colorTokens: tokens,
        spatial: {
          ...node.spatial,
          color: custom?.color && /^#[0-9a-f]{6}$/i.test(custom.color) ? custom.color : (tokens?.pinCore ?? "#557fa6"),
        },
      };
    }
    if (node.flow)
      return {
        ...node,
        flow: {
          ...node.flow,
          color:
            typeof raw.color === "string" && /^#[0-9a-f]{6}$/i.test(raw.color)
              ? raw.color
              : flows.get(String(raw.type || node.key).trim())!.pinCore,
        },
      };
    if (node.timeline && settings) {
      const t = node.timeline;
      const colorTokens =
        settings.colorBy === "type"
          ? settings.typeColors[type]
            ? undefined
            : tokens
          : tracks.get(normalizeTypeLabel(t.track) ?? "");
      return {
        ...node,
        colorTokens,
        timeline: {
          ...t,
          color:
            settings.colorBy === "type"
              ? timelineTypeColor(type, settings.typeColors, types)
              : (tracks.get(normalizeTypeLabel(t.track) ?? "")?.pinCore ?? t.color),
          intervalStyle: settings.intervalStyle,
          intervalBorder: settings.intervalBorder,
          intervalBorderColor: settings.intervalBorderColor,
          intervalRadius: settings.intervalRadius,
          intervalTextColor: settings.intervalTextColor,
          intervalTextColorMode: settings.intervalTextColorMode,
          pointMarker: settings.pointMarker,
          anchorMarker: settings.anchorMarker,
          pointTextColor: settings.pointTextColor,
          pointDateColor: settings.pointDateColor,
          leaderStyle: settings.leaderStyle,
          leaderColor: settings.leaderColor,
        },
      };
    }
    return { ...node, colorTokens: type ? tokens : undefined };
  });
  const nodeMap = { ...scene.nodeMap, ...Object.fromEntries(nodes.map((n) => [n.key, n])) };
  const edges = scene.edges.map((e) =>
    e.flow
      ? { ...e, flow: { ...e.flow, color: nodeMap[e.source]?.flow?.color ?? e.flow.color } }
      : e.timeline
        ? { ...e, timeline: { ...e.timeline, color: nodeMap[e.source]?.timeline?.color ?? e.timeline.color } }
        : e,
  );
  const timeline = scene.timeline
    ? {
        ...scene.timeline,
        tracks: scene.timeline.tracks.map((t) => ({
          ...t,
          color: tracks.get(normalizeTypeLabel(t.id) ?? "")?.pinCore ?? t.color,
        })),
      }
    : undefined;
  return { ...scene, nodes, nodeMap, edges, ...(timeline ? { timeline } : {}) };
}
