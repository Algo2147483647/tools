import type { GraphChartType } from "../../graph/types";
import { getLayoutControls, type SettingsChapter } from "./settingsConfig";

export const APPEARANCE_GROUPS = [
  { id: "presets", label: "Presets" },
  { id: "nodes", label: "Nodes" },
  { id: "edges", label: "Edges" },
  { id: "text", label: "Text" },
  { id: "advanced", label: "Advanced" },
] as const;
export type AppearanceGroup = (typeof APPEARANCE_GROUPS)[number]["id"];
export interface SettingItem {
  id: string;
  chapter: SettingsChapter;
  group: string;
  label: string;
  keywords: string;
}

export function getSettingsCatalog(chart: GraphChartType): SettingItem[] {
  const items: SettingItem[] = [];
  const add = (id: string, chapter: SettingsChapter, group: string, label: string, keywords: string) =>
    items.push({ id, chapter, group, label, keywords });
  const a = (id: string, group: string, label: string, keywords = "") => add(id, "appearance", group, label, keywords);
  add(
    "files",
    "files",
    "Files",
    "Open & create",
    "workspace graph new recent import export file folder 文件 工作区 打开 新建 最近",
  );
  add("session", "files", "Workspace", "Current session", "manifest location refresh close 会话 路径");
  add("console", "general", "Interface", "Graph console", "panel sidebar ai commands 控制台 面板 侧栏 命令");
  add(
    "chart",
    "chart",
    "Chart type",
    "Chart type",
    "diagram node-link nested compound sankey timeline 图类型 嵌套 桑基 时间线",
  );
  if (chart === "node-link")
    add("engine", "layout", "Arrangement", "Layout engine", "algorithm sugiyama dagre bfs level 排布 算法 引擎");
  if (chart === "compound")
    add("nested", "layout", "Arrangement", "Nested layout", "compound elk group subgraph 嵌套 分组 排布");
  if (chart === "timeline") {
    add(
      "timeline-arrangement",
      "layout",
      "Timeline",
      "Timeline arrangement",
      "track flow spread horizontal 轨道 关系 展开 水平",
    );
    add(
      "timeline-axis",
      "layout",
      "Timeline",
      "Time axis",
      "tick unit interval adaptive compression lock fit 时间 刻度 单位 间隔 压缩 锁定",
    );
  }
  if (chart === "sankey") add("sankeyNodeWidth", "layout", "Flow", "Flow node width", "bar sankey 桑基 节点 宽度");
  for (const c of getLayoutControls(chart))
    add(
      c.key,
      "layout",
      "Dimensions",
      c.label,
      {
        columnGap: "layer distance 层间距",
        rowGap: "node gap spacing 节点 间距",
        edgeLaneGap: "edge gap spacing 连线 间距",
        nodeHeight: "node height 节点 高度",
        maxNodeWidth: "node width 节点 宽度",
      }[c.key],
    );
  a(
    "presets",
    "Presets",
    "Style presets",
    "theme simple compact default slate blueprint contrast presentation 预设 主题",
  );
  if (chart === "node-link" || chart === "compound") {
    a("nodeCornerRadius", "Nodes", "Corner radius", "node shape rounded 圆角 节点 形状");
    a("showNodeDots", "Nodes", "Node dots", "pins markers 节点 圆点");
    a("alignNodeWidthsToMax", "Nodes", "Equal node widths", "align width 对齐 等宽");
  }
  if (chart !== "timeline") {
    a("nodeShadow", "Nodes", "Soft shadows", "shadow elevation 阴影");
    a("shadowBlur", "Nodes", "Shadow softness", "shadow blur 阴影 模糊");
    a("shadowOffset", "Nodes", "Shadow distance", "shadow offset 阴影 偏移");
    a("shadowOpacity", "Nodes", "Shadow opacity", "shadow alpha 阴影 透明度");
    a("hideNodeBorders", "Nodes", "Node borders", "outline 边框");
  }
  if (chart !== "sankey") a("showNodeDetail", "Nodes", "Node descriptions", "detail visibility 描述 详情");
  if (chart === "compound")
    a("showGroupStats", "Nodes", "Group statistics", "internal edges nodes counts 分组 统计 数量");
  if (chart === "sankey") a("sankeyLinkOpacity", "Edges", "Flow opacity", "bands alpha 桑基 流带 透明度");
  a("showEdgeLabels", "Edges", "Edge labels", "relation value 连线 标签");
  const colors =
    chart === "sankey"
      ? ["--dag-text-strong", "--dag-text-soft"]
      : chart === "timeline"
        ? ["--dag-node-fill", "--dag-edge", "--dag-text-strong", "--dag-text-soft"]
        : [
            "--dag-node-fill",
            "--dag-node-border",
            "--dag-node-border-strong",
            "--dag-edge",
            "--dag-edge-active",
            "--dag-text-strong",
            "--dag-text-soft",
          ];
  const colorLabels: Record<string, string> = {
    "--dag-node-fill": "Node fill",
    "--dag-node-border": "Node border",
    "--dag-node-border-strong": "Emphasized border",
    "--dag-edge": "Edge color",
    "--dag-edge-active": "Active edge",
    "--dag-text-strong": "Title color",
    "--dag-text-soft": "Secondary text",
  };
  const colorKeywords: Record<string, string> = {
    "--dag-node-fill": "fill 填充",
    "--dag-node-border": "outline 边框",
    "--dag-node-border-strong": "root strong 边框 强调",
    "--dag-edge": "line stroke 连线",
    "--dag-edge-active": "active highlight 连线 高亮",
    "--dag-text-strong": "title 文字 标题",
    "--dag-text-soft": "soft secondary 文字 次要",
  };
  for (const id of colors)
    a(
      id,
      id.includes("text") ? "Text" : id.includes("edge") ? "Edges" : "Nodes",
      colorLabels[id],
      `colors colour 颜色 ${colorKeywords[id]}`,
    );
  a("fontFamily", "Text", "Title font", "typography family 字体");
  a("fontWeight", "Text", "Bold title", "typography weight 粗体 字重");
  if (chart !== "timeline") {
    a("fontSize", "Text", "Title size", "typography font size 字号");
    a("fontStyle", "Text", "Italic title", "typography italic 斜体");
  }
  a("css", "Advanced", "Custom CSS", "stylesheet 高级 样式");
  a("configuration", "Advanced", "Appearance configuration", "import export reset 导入 导出 重置");
  add(
    "ai-connection",
    "ai",
    "Connection",
    "Provider & model",
    "ai assistant provider model base url api key test connection 服务商 模型 地址 密钥 连接",
  );
  add(
    "ai-advanced",
    "ai",
    "Advanced",
    "Execution & generation",
    "ai assistant execution ask review auto edit temperature tokens 自动 审核 执行 温度",
  );
  return items;
}

export function matchesSetting(item: SettingItem, query: string) {
  const haystack = `${item.chapter} ${item.group} ${item.label} ${item.keywords}`.toLowerCase();
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .every((word) => haystack.includes(word));
}
