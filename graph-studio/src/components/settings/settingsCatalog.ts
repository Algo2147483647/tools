import type { GraphChartType } from "../../graph/types";
import { getAppearanceSchema } from "../../schema/appearance/schema";
import { APPEARANCE_UI, resolveUIPath, type AppearanceUINode } from "./appearanceUIConfig";
import { type SettingsChapter } from "./settingsConfig";

export const APPEARANCE_GROUPS = [
  { id: "schema", label: "Schema" },
  { id: "presets", label: "Presets" },
  { id: "canvas", label: "Canvas" },
  { id: "nodes", label: "Nodes" },
  { id: "edges", label: "Edges" },
  { id: "advanced", label: "Advanced" },
] as const;
export type AppearanceGroup = (typeof APPEARANCE_GROUPS)[number]["id"];
export interface SettingItem {
  id: string;
  uiId?: string;
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
  add("export", "general", "Export", "Export current view", "svg html canvas 导出 画布");
  add(
    "session",
    "general",
    "Workspace",
    "Current session",
    "workspace manifest location refresh close 会话 工作区 路径",
  );
  add("console", "general", "Interface", "Graph console", "panel sidebar ai commands 控制台 面板 侧栏 命令");
  add(
    "chart",
    "chart",
    "Chart type",
    "Chart type",
    "diagram node-link nested compound sankey timeline spatial space coordinates 空间 坐标 schema json example fields 图类型 嵌套 桑基 时间线 结构 字段 示例",
  );
  if (chart === "node-link")
    add("engine", "layout", "Arrangement", "Layout engine", "algorithm sugiyama dagre bfs level 排布 算法 引擎");
  if (chart === "sankey")
    add("flow-layout", "layout", "Arrangement", "Automatic flow layout", "flow direction rules sankey 桑基 流向 规则");
  if (chart === "spatial")
    add("projection", "layout", "Arrangement", "Coordinate projection", "axes rotate coordinates 空间 坐标 投影");
  if (chart === "compound")
    add(
      "nested-layout",
      "layout",
      "Arrangement",
      "Nested layout",
      "routes layout direction boundary scope ai preview rules 嵌套 布局 规则 范围 方向 边界",
    );
  if (chart === "timeline")
    add(
      "timeline-method",
      "layout",
      "Arrangement",
      "Timeline layout",
      "tracks flow ai preview rules 时间线 轨道 布局 规则",
    );
  const schema = getAppearanceSchema(chart);
  for (const [path, entry] of schema.entries) {
    if (!entry.editable || !entry.definition.group) continue;
    const field = entry.definition,
      group = field.group!;
    add(
      path,
      group === "layout" ? "layout" : "appearance",
      group[0].toUpperCase() + group.slice(1),
      field.label ?? path,
      `${path} ${field.description ?? ""} ${field.keywords ?? ""}`,
    );
  }
  function visit(node: AppearanceUINode, group: string, parent?: string) {
    if (node.charts && !node.charts.includes(chart)) return;
    const path = resolveUIPath(parent, node.path),
      entry = path ? schema.entries.get(path) : undefined;
    if (path && !entry?.supported) return;
    const item = items.find((item) => item.id === path);
    if (item) {
      item.uiId = node.id;
      if (node.label) item.label = node.label;
    } else if (node.renderer?.startsWith("timeline-"))
      add(
        node.id,
        group === "Layout" ? "layout" : "appearance",
        group,
        node.label ?? node.id.replace(/-/g, " "),
        `${node.id} ${[...schema.entries]
          .filter(([p, e]) => p.startsWith(path ?? "style.timeline") && e.definition.group === group.toLowerCase())
          .map(([p, e]) => `${p} ${e.definition.label ?? ""} ${e.definition.keywords ?? ""}`)
          .join(" ")}`,
      );
    node.children?.forEach((child) => visit(child, group, path));
  }
  for (const [group, node] of Object.entries(APPEARANCE_UI))
    visit(node, group === "timelineLayout" ? "Layout" : group[0].toUpperCase() + group.slice(1));
  a("appearance-schema", "Schema", "Style schema", "protocol json example fields required optional 协议 示例 字段");
  a("presets", "Presets", "Style presets", "theme default 预设 默认 主题");
  a("configuration", "Advanced", "Appearance configuration", "import export reset 导入 导出 重置");
  add(
    "ai-connection",
    "ai",
    "Connection",
    "Provider & model",
    "ai assistant provider model base url api key test connection 服务商 模型 地址 密钥 连接",
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
