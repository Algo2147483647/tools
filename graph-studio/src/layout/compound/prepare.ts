import type { TypeSelection } from "../../graph/typeFilter";
import { getNodeDefine, getNodeType } from "../../graph/accessors";
import { projectCompoundGraph } from "../../graph/compound/projection";
import { getGroupNodes } from "../../graph/compound/hierarchy";
import type { CompoundView, NormalizedDag } from "../../graph/types";
import { stageRoleFont, stageTitleFont, type StageAppearance } from "../shared/appearance";
import { estimateTextWidth, getNodeVisual, layoutCardTitle, measureText, wrapDetailText } from "../shared/text";
import { cardContentLayout, minimumCardHeight } from "../shared/typography";
import {
  COMPOUND_LAYOUT_VERSION,
  layoutFingerprint,
  emptyLayoutData,
  type CompoundLayoutData,
  type LayoutProblem,
} from "./layout-plan";
import { measureGroupTitle } from "../shared/group-title";

export interface CompoundInput {
  dag: NormalizedDag;
  view: CompoundView;
  selectedType?: TypeSelection;
  appearance: StageAppearance;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  showEdgeLabels?: boolean;
  layout?: CompoundLayoutData;
}

export function prepareCompound(input: CompoundInput) {
  const { dag, view, appearance, showNodeDetail, alignNodeWidthsToMax } = input;
  const projection = projectCompoundGraph(dag, view, input.selectedType);
  for (const item of projection.items)
    if (item.kind === "group" && !item.collapsed) item.titleMetrics = measureGroupTitle(item.title);
  const groupParents = new Map((dag.hierarchy_edges ?? []).map((edge) => [edge.target, edge.source]));
  // Use all original roots, including collapsed/hidden ones, to keep colors stable.
  const colorFamilies = new Map(
    Object.keys(getGroupNodes(dag))
      .filter((id) => !groupParents.has(id))
      .sort()
      .map((id, index) => [id, index]),
  );
  // Zero requested spacing still needs a routing corridor between card boundaries.
  const theme = {
    ...appearance,
    nodes: {
      ...appearance.nodes,
      spacing: {
        ...appearance.nodes.spacing,
        column: Math.max(12, appearance.nodes.spacing.column),
        row: Math.max(12, appearance.nodes.spacing.row),
      },
    },
  };
  const font = stageTitleFont(appearance);
  const detailFont = stageRoleFont(appearance, "detail"),
    detailLineHeight = Math.ceil(detailFont.size * 1.2);
  const visuals = new Map<string, { title: string; detail: string; width: number }>();
  for (const item of projection.items) {
    const internalEdgeCount = item.internalEdgeIds.length;
    const detail = `${item.leafCount} node${item.leafCount === 1 ? "" : "s"} · ${internalEdgeCount} internal edge${internalEdgeCount === 1 ? "" : "s"}`;
    const visual = getNodeVisual(
      item.id,
      dag.nodes[item.id],
      theme.nodes.widths,
      showNodeDetail,
      alignNodeWidthsToMax,
      font,
      detailFont,
    );
    if (item.kind === "group" && !getNodeDefine(dag.nodes[item.id])) visual.detail = "";
    if (item.kind === "group" && appearance.display.showGroupStats !== false)
      visual.detail = [visual.detail, detail].filter(Boolean).join(" · ");
    visuals.set(item.id, visual);
  }
  function cardGeometry(
    visual: { title: string; detail: string; width: number },
    kind: string,
    external: boolean,
    fixedHeight?: number,
  ) {
    const detailLines = visual.detail ? wrapDetailText(visual.detail, visual.width - 60, 2, detailFont) : [];
    const hasBadge = external || kind === "group";
    const titleLayout = layoutCardTitle(visual.title, visual.width, font, appearance.display);
    const height =
      fixedHeight ??
      Math.max(
        theme.nodes.height,
        minimumCardHeight(font, detailLines.length, hasBadge, titleLayout.lines.length, detailLineHeight),
      );
    const contentLayout = cardContentLayout(
      height,
      font,
      detailLines.length,
      hasBadge,
      titleLayout.lines.length,
      detailLineHeight,
    );
    return { titleLayout, height, contentLayout, detailLines };
  }

  const sizes = new Map(
    projection.items.map((item) => {
      const visual = visuals.get(item.id)!;
      const { height } = cardGeometry(visual, item.kind, item.external);
      return [item.id, { width: visual.width, height }];
    }),
  );
  const labelSizes = Object.fromEntries(
    projection.edges
      .filter((e) => e.label)
      .map((edge) => [
        edge.id,
        {
          width: Math.max(
            edge.label.length * 7 + 12,
            estimateTextWidth(edge.label, 10) + 14,
            measureText(edge.label, { size: 10, family: "Arial, sans-serif", weight: "400", style: "normal" }) + 14,
          ),
          height: 18,
        },
      ]),
  );
  const config = input.layout ?? emptyLayoutData();
  // Session font counters are excluded: measured dimensions and typography determine portability.
  const fingerprint = layoutFingerprint({
    engine: COMPOUND_LAYOUT_VERSION,
    items: projection.items,
    edges: projection.edges,
    focus: projection.focusGroupId,
    sizes: [...sizes],
    labelSizes,
    appearance: { ...appearance, fontMetricsKey: undefined },
    showLabels: input.showEdgeLabels ?? false,
  });
  const problem: Omit<LayoutProblem, "baseline"> = {
    viewKey: JSON.stringify([view.focusGroupId, [...view.collapsedGroupIds].sort(), input.selectedType ?? ""]),
    minimumSizes: Object.fromEntries(sizes),
    projection,
    fingerprint,
    labelSizes,
    showLabels: input.showEdgeLabels ?? false,
    columnGap: theme.nodes.spacing.column,
    rowGap: theme.nodes.spacing.row,
    minimumCanvas: { width: theme.canvas.minSize[0], height: theme.canvas.minSize[1] },
    stored: config,
    nodeSemantics: Object.fromEntries(
      projection.items.map((item) => [
        item.id,
        {
          type: getNodeType(dag.nodes[item.id]),
          description: getNodeDefine(dag.nodes[item.id]),
        },
      ]),
    ),
  };
  return { input, problem, sizes, theme, visuals, cardGeometry, groupParents, colorFamilies };
}
export type PreparedCompound = ReturnType<typeof prepareCompound>;
