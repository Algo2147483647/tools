import { getNodeDefine, getNodeTitle, getNodeType } from "../../graph/accessors";
import { projectCompoundGraph } from "../../graph/compound/projection";
import { getGroupNodes } from "../../graph/compound/hierarchy";
import type { CompoundView, NormalizedDag } from "../../graph/types";
import { stageRoleFont, stageTitleFont, type StageAppearance } from "../shared/appearance";
import { roundedPolylinePath } from "../shared/rounded-path";
import { estimateTextWidth, getNodeVisual, layoutCardTitle, measureText, wrapDetailText } from "../shared/text";
import type { StageData, StageGroup, StageNode } from "../shared/types";
import { cardContentLayout, minimumCardHeight } from "../shared/typography";
import { layoutCompoundHierarchy } from "./hierarchy-layout";
import {
  COMPOUND_LAYOUT_VERSION,
  layoutFingerprint,
  emptyLayoutData,
  type CompoundLayoutData,
  type LayoutResult,
  type LayoutProblem,
} from "./layout-plan";
import { FCOSE_ENGINE, fcoseParameters } from "./fcose/options";
import { compoundModeSettings } from "../../graph/compound/layoutData";
import { arrangeCompound } from "./automatic";
import { measureGroupTitle } from "../shared/group-title";

export interface CompoundStageInput {
  dag: NormalizedDag;
  view: CompoundView;
  selectedType?: string;
  appearance: StageAppearance;
  showNodeDetail: boolean;
  alignNodeWidthsToMax: boolean;
  showEdgeLabels?: boolean;
  layout?: CompoundLayoutData;
  solve?: (problem: LayoutProblem) => Promise<LayoutResult>;
  place?: (...args: Parameters<typeof layoutCompoundHierarchy>) => Promise<ReturnType<typeof layoutCompoundHierarchy>>;
}

/** Pure projection and measurement: no placement or routing. */
export function measureCompoundStage(input: CompoundStageInput) {
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
  const warnings: string[] = [];
  // Session font counters are excluded: measured dimensions and typography determine portability.
  const fingerprint = layoutFingerprint({
    engine: config.method === "fcose" ? FCOSE_ENGINE : COMPOUND_LAYOUT_VERSION,
    settings: { method: config.method, ...compoundModeSettings(config) },
    parameters: config.method === "fcose" ? fcoseParameters(config.objective) : undefined,
    graph: dag,
    view,
    selectedType: input.selectedType ?? "",
    items: projection.items,
    edges: projection.edges,
    focus: projection.focusGroupId,
    sizes: [...sizes],
    labelSizes,
    appearance: { ...appearance, fontMetricsKey: undefined },
    showLabels: input.showEdgeLabels ?? false,
  });
  const problem: LayoutProblem = {
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
    baseline: {
      boxes: {},
      routes: {},
      width: theme.canvas.minSize[0],
      height: theme.canvas.minSize[1],
    },
  };
  return { input, problem, sizes, theme, visuals, cardGeometry, groupParents, colorFamilies, warnings, detailFont };
}
export type CompoundMeasurement = ReturnType<typeof measureCompoundStage>;

/** Existing modes retain their original initialization and solver. */
export async function solveCompoundStage(measured: CompoundMeasurement): Promise<LayoutResult> {
  const { input, problem, sizes, theme } = measured;
  if (problem.stored.method === "fcose") {
    const loops = input.dag.edges.filter(
      (e) => e.source === e.target && problem.projection.representative.get(e.source) === e.source,
    );
    if (loops.length)
      throw new Error(
        `fCoSE does not support visible self-loops: ${loops.map((e) => e.id).join(", ")}. Current view kept.`,
      );
    if (input.solve) return input.solve(problem);
    const { solveFcose } = await import("./fcose/solver");
    return solveFcose(problem);
  }
  const placement = await (input.place ?? layoutCompoundHierarchy)(
    problem.projection,
    sizes,
    theme,
    problem.showLabels,
    problem.labelSizes,
  );
  problem.baseline = {
    boxes: Object.fromEntries(placement.boxes),
    routes: {},
    width: Math.max(placement.width, theme.canvas.minSize[0]),
    height: Math.max(placement.height, theme.canvas.minSize[1]),
  };
  return input.solve ? input.solve(problem) : arrangeCompound(problem);
}

export async function buildCompoundStage(input: CompoundStageInput): Promise<StageData> {
  const measured = measureCompoundStage(input);
  return renderCompoundStage(measured, await solveCompoundStage(measured));
}

/** Shared renderer consumes only a fully solved, validated geometry. */
export function renderCompoundStage(measured: CompoundMeasurement, solved: LayoutResult): StageData {
  const { input, problem, theme, visuals, cardGeometry, groupParents, colorFamilies, warnings, detailFont } = measured;
  const { dag, showNodeDetail } = input;
  const { projection } = problem;
  const geometry = solved.geometry;
  warnings.push(...solved.diagnostics);
  problem.baseline = geometry;
  const result = {
    boxes: new Map(Object.entries(geometry.boxes)),
    routes: new Map(Object.entries(geometry.routes)),
    width: geometry.width,
    height: geometry.height,
  };
  const nodes: StageNode[] = [];
  const groups: StageGroup[] = [];
  const nodeMap: StageData["nodeMap"] = Object.create(null);
  for (const item of projection.items) {
    const id = item.id;
    const { x: left, y: top, width, height } = result.boxes.get(id)!;
    const visual = visuals.get(id)!;
    if (item.kind === "group" && !item.collapsed) {
      nodeMap[id] = {
        key: id,
        kind: "group",
        title: visual.title,
        displayTitle: visual.title,
        detail: visual.detail,
        detailLines: [],
        width,
        height,
        x: left + width / 2,
        y: top + height / 2,
        layer: item.depth,
        order: groups.length,
        isRoot: false,
      };
      // Use the original root ancestor so drilling into a group preserves its color family.
      let colorFamilyId = id;
      while (groupParents.has(colorFamilyId)) {
        colorFamilyId = groupParents.get(colorFamilyId)!;
      }
      groups.push({
        id,
        colorFamilyIndex: colorFamilies.get(colorFamilyId) ?? 0,
        title: item.title,
        titleMetrics: item.titleMetrics,
        depth: item.depth,
        leafCount: item.leafCount,
        x: left,
        y: top,
        width,
        height,
      });
    } else {
      const geometry = cardGeometry({ ...visual, width }, item.kind, item.external, height);
      const stageNode: StageNode = {
        key: id,
        kind: item.kind,
        groupStatsOnly: item.kind === "group" && (!showNodeDetail || !getNodeDefine(dag.nodes[id])),
        external: item.external,
        layer: item.depth,
        order: nodes.length,
        title: visual.title,
        displayTitle: geometry.titleLayout.lines.join("\n"),
        titleLayout: geometry.titleLayout,
        detail: visual.detail,
        detailLines: visual.detail ? wrapDetailText(visual.detail, width - 60, 2, detailFont) : [],
        typeLabel: item.external ? "External" : item.kind === "group" ? "Subgraph" : undefined,
        width,
        height,
        isRoot: false,
        x: left + width / 2,
        y: top + height / 2,
      };
      stageNode.contentLayout = geometry.contentLayout;
      nodes.push(stageNode);
      nodeMap[id] = stageNode;
    }
  }
  const edges: StageData["edges"] = [];
  const originalEdges = new Map(dag.edges.map((edge) => [edge.id, edge]));
  for (const original of projection.edges) {
    const route = result.routes.get(original.id)!;
    edges.push({
      ...original,
      weight: undefined,
      description: original.originalEdgeIds
        .map((id) => {
          const source = originalEdges.get(id)!;
          return `${id}: ${source.source} → ${source.target}${source.value === undefined ? "" : ` (${source.value})`}`;
        })
        .join("\n"),
      points: route.points.map((point, order) => ({ ...point, layer: 0, order })),
      path: roundedPolylinePath(route.points),
      labelPosition: route.labelPosition,
    });
  }
  const connectedKeysByNode = new Map<string, Set<string>>(
    projection.items.map((item) => [item.id, new Set<string>()]),
  );
  edges.forEach((edge) => {
    connectedKeysByNode.get(edge.source)?.add(edge.target);
    connectedKeysByNode.get(edge.target)?.add(edge.source);
  });
  return {
    compoundLayout: problem,
    layoutQuality: solved.quality,
    layoutProvenance: solved.provenance ?? { method: problem.stored.method, engine: COMPOUND_LAYOUT_VERSION },
    dag: dag.nodes,
    layoutMode: "compound",
    root: "",
    topLevelKeys: [],
    isForest: true,
    selection: {
      rootKey: "",
      topLevelKeys: [],
      isForest: true,
      label: projection.focusGroupId ? getNodeTitle(dag.nodes[projection.focusGroupId]) : "All groups",
      appSelection: { type: "full" },
    },
    nodeMap,
    nodes,
    groups: groups.sort((a, b) => a.depth - b.depth),
    edges,
    connectedKeysByNode,
    lanes: [],
    stageWidth: Math.max(result.width ?? 0, theme.canvas.minSize[0]),
    stageHeight: Math.max(result.height ?? 0, theme.canvas.minSize[1]),
    warnings,
  };
}
