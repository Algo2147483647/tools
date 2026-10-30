import type { StageData } from "../shared/types";
import type { PreparedNodeLink } from "./input";
import { truncateTitleToWidth, wrapDetailText } from "../shared/text";
import { cardContentLayout } from "../shared/typography";

/** Same measured boxes can reuse geometry while a newly loaded font changes fitted text. */
export function refreshFlatText(scene: StageData, prepared: PreparedNodeLink): StageData {
  const nodes = scene.nodes.map((node) => {
    const visual = prepared.visualByKey.get(node.key);
    if (!visual) return node;
    const detailLines = node.flow
      ? []
      : visual.detail
        ? wrapDetailText(visual.detail, Math.max(visual.width - 74, 72), 2, prepared.detailFont)
        : [];
    return {
      ...node,
      title: visual.title,
      detail: visual.detail,
      detailLines,
      displayTitle: truncateTitleToWidth(
        visual.title,
        node.flow ? prepared.theme.nodes.widths[1] : visual.width,
        prepared.font,
      ),
      ...(!node.flow
        ? {
            contentLayout: cardContentLayout(
              node.height,
              prepared.font,
              detailLines.length,
              !!node.typeLabel,
              1,
              prepared.detailLineHeight,
            ),
          }
        : {}),
    };
  });
  return { ...scene, nodes, nodeMap: { ...scene.nodeMap, ...Object.fromEntries(nodes.map((n) => [n.key, n])) } };
}
