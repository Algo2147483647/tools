# 工作区与打开方式

Graph Studio 启动时显示首页，不加载示例，也不自动恢复上次图的内容。首页提供 **Open graph file**、**Open workspace**、**Recent workspaces** 和新建图入口。

## 单文件与工作区

| 模式 | 行为 |
| --- | --- |
| Open graph file | 打开一个 Graph Studio v3 JSON；编辑和保存该文档；不解析相邻文件。 |
| Open workspace | 以所选文件夹为根目录，识别图文档，显示文件列表，按规则选择启动图；图文件相互独立。 |
| Recent workspaces | 重新打开所选工作区，并优先打开上次使用的图。权限失效时请求重新授权，或提示重新选择文件夹。 |

工作区不会合并节点或跨文件建立边；不同文件可以使用相同节点 ID。切换文件、打开其他工作区、新建或关闭工作区前，如果有未保存修改，会提示是否放弃。返回首页保留当前会话，可通过 Return to current session 返回。

## 工作区清单

在文件夹根目录放置 `graph-studio.workspace.json`：

```json
{
  "format": "graph-studio-workspace",
  "version": 1,
  "name": "My knowledge workspace",
  "graphs": ["graphs/concepts.json", "graphs/theorems.json"],
  "defaultGraph": "graphs/concepts.json",
  "metadata": { "description": "My graph collection" }
}
```

结构见 [workspace.schema.json](../public/workspace.schema.json)。`format / version / graphs` 必填；`name / defaultGraph / metadata` 可选。未知格式、版本、顶层字段、无效路径或缺失的清单文件引用会明确报错，并保留当前会话。

- `graphs` 是工作区根目录下的相对 JSON 路径；顺序即文件列表顺序。允许空数组。
- 路径使用正斜杠，不允许绝对路径、`.`、`..`、重复项、URL 查询或锚点。
- `defaultGraph` 必须出现在 `graphs` 中。
- `metadata` 保留任意合法 JSON 对象，下载清单时保留原值。
- 清单只限制图文件识别；其他工作区文件仍可用于链接预览。
- **Download workspace manifest** 下载当前清单，不自动写入源文件夹。将其放在工作区根目录后刷新文件列表即可使用。错误图条目不会被自动删掉。

## 无清单时的识别

扫描 JSON 内容，仅识别 `format: "graph-studio"` 的正式 v3 图。无关 JSON（例如 package.json）不会被导入。根目录 `graph.json` 和所有 `*.graph.json` 视为明确声明的图：格式错误会列出错误，不会默默忽略。

启动图的优先顺序：

1. 通过最近工作区打开时，上次使用且仍有效的图。
2. 清单中的 `defaultGraph`。
3. 根目录的 `graph.json`。
4. 图列表只有一个条目且有效时，打开该图。
5. 其他情况显示工作区概览，由用户在 Explorer 中选择。

指定的默认图存在但无效时，显示错误并等待选择，不会悄悄替换成其他图。图清单出现无效文档时显示错误标记；其他有效图仍可单独打开。

为控制扫描成本，跳过隐藏目录及 `node_modules / dist / build / coverage / vendor`。单 JSON 上限 16 MB，目录最多 20,000 文件、32 层；无清单时最多扫描 1,000 个 JSON，更多时提示提供清单或打开更小的文件夹。

## 链接解析

Resolve Path 已删除。仅当前打开的工作区提供本地链接解析范围：

- 节点链接相对于当前图 JSON 所在目录，例如 `graphs/main.json` 中的 `../docs/readme.md`。
- Markdown 预览中的链接、图片相对于该 Markdown 所在目录。
- 支持工作区内部的 `../`、URL 编码和 Windows 反斜杠；越过工作区根目录的路径会被拒绝。
- 只访问已枚举到的工作区文件；不访问其他文件夹，也不自动请求新的路径授权。
- 单文件模式点击本地链接时提示打开工作区。网络链接继续使用浏览器打开。

## 最近位置与刷新

最近 20 个文件/工作区记录在当前浏览器。支持 File System Access API 时，将文件或目录句柄保存在 IndexedDB；重新打开后读取磁盘最新内容，并在需要时请求读权限。只支持文件选择的浏览器保留显示信息，点击最近项目后需重新选择来源。

浏览器不会提供完整 Windows 绝对路径，因此界面记录目录/文件名称、工作区内相对路径和可重开的来源句柄。两个同名但不同位置的目录不会仅凭名称自动合并。

**Refresh file list** 在有目录句柄时重新识别文件列表，保留当前图的内存编辑。没有目录句柄时需要重新选择文件夹；重新加载前同样保护未保存修改。这里没有后台文件监听。移除最近记录不会删除本地文件；浏览器站点数据被清除后记录会消失。

## Settings

设置按 **Workspace / Appearance / Layout / AI assistant** 分组，搜索框筛选相关分类。外观提供实时预览、预设卡片、颜色和字体表单、明确的开关及折叠的高级 CSS；布局提供引擎卡片和尺寸滑块。修改自动保存在当前浏览器，CSS 草稿需点击 Apply CSS。图文件保存与界面设置彼此独立。
