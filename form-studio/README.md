# Form Studio 2

中文可视化表单工作台。从组件库、设计画布到属性面板，围绕实际编辑流程重新设计。纯前端运行，草稿保存在当前浏览器，预览提交不会发送到服务器。

## 启动

Windows 双击 `launch.cmd`，或在 PowerShell 运行：

```powershell
D:\xiongzihao\tools\form-studio\launch.cmd
```

启动器共用仓库外层 `scripts/node-runtime.ps1`，查找 Node.js 22.12+，优先使用 PATH，也支持 Codex 自带的 Node 和 pnpm。首次运行自动安装依赖，然后检查 TypeScript、构建并打开 `http://127.0.0.1:4174/`。保持终端开启，Ctrl+C 停止。SVG Studio 继续使用 4173，两个工具可同时运行。

```powershell
.\launch.cmd -Dev          # 开发模式，端口 5173
.\launch.cmd -NoBrowser    # 不自动打开浏览器
.\launch.cmd -BuildOnly    # 仅检查与构建
```

macOS、Linux 或手动启动：

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

这是 Vite 应用，请通过 HTTP 启动；不能直接双击源代码中的 `index.html`。生产部署可将 `dist/` 放入任意静态服务器，资源路径为相对路径，支持子目录部署。

## 工作流

- **设计**：点击或拖入左侧组件，选中字段后在右侧配置标题、唯一标识、说明、默认值、宽度、校验与选项。
- **结构**：查看嵌套关系；通过「所属分组」在任意容器之间移动。分组支持卡片、1–4 列栅格和折叠布局。
- **显示规则**：支持全部 / 任意条件、等于、不等于、包含、为空、不为空。字段重命名时同步修改引用，删除时清理关联规则。
- **预览**：切换桌面或手机宽度，真实填写表单；验证必填、邮箱、数字范围、字符长度、选项与级联路径；成功后复制或下载提交结果。
- **Schema**：CodeMirror JSON 编辑器提供语法高亮、折叠与语法诊断。应用前执行完整结构校验，错误不会覆盖当前表单。
- **导入 / 导出**：支持 JSON 文件，最大 2 MB。导入与模板替换均可撤销。
- **恢复**：最多 80 步撤销与重做；连续输入合并历史。每次有效编辑、撤销、重做均保存本地草稿，刷新可恢复。浏览器存储失败会显示明确提示。

提供 17 种组件：单行文本、多行文本、数字、邮箱、下拉选择、单选、多选、开关、级联选择、日期、时间、滑动条、颜色、分组卡片、栅格、折叠分组、分割线。内置空白、活动报名、意见反馈三种模板。

快捷键：Ctrl/⌘+Z 撤销，Ctrl/⌘+Shift+Z 重做，Ctrl/⌘+D 复制字段，Delete 删除，Ctrl/⌘+S 导出，`/` 搜索，Esc 取消选择。聚焦选中字段的拖动柄后，↑/↓ 可以排序。文本输入期间保留原生编辑快捷键。

## Schema 与旧版迁移

内部格式为 `version: 2` 的类型化文档。导出保留原项目的 `{ form, schema: { properties } }` 外壳和 `x-component`、`x-component-props`、`x-visibility`，同时使用 `x-studio` 保存主题、表单文案、字段 ID 和宽度。

- 可以导入旧项目导出的 Input、Textarea、InputNumber、Select、Radio、Checkbox、Switch、Cascader、DatePicker、TimePicker、ColorPicker、Slider、Card、Grid、Collapse、Divider。
- 支持旧版空校验器数组和 `ruleKey: required`；保留选项值、默认值、隐藏、禁用、只读和条件显隐。
- 旧版重复 `name` 使用不同的 property key 消歧；无效字段标识明确报错，不静默丢弃。
- 旧 Collapse 的静态 panel 内容迁移成只读子字段。旧 Grid 的绝对列槽位统一迁移为顺序栅格布局。
- 未知组件、自定义 `x-reactions` 和自定义校验器拒绝导入，需先转换。不会执行 Schema 中的脚本。
- 布局容器是无数据节点，提交数据使用全局唯一字段标识组成扁平对象。隐藏、条件不满足和禁用的字段不参与提交。

`x-studio` 和 `x-visibility` 是本项目的扩展。导出的 JSON 不是任意 Formily 运行时都能直接执行的完整配置；外部接入时需要对应组件映射和条件规则适配。项目目前不包含服务器收集、账号、公开发布或云端同步。

## 技术与目录

使用安装时稳定版 React 19.3、TypeScript 7、Vite 8.3、Zustand 5、Zod 4、dnd-kit、CodeMirror 6 和 Lucide。精确版本由 `pnpm-lock.yaml` 固定。字体采用系统回退栈，运行时无 CDN 依赖。

```text
src/
  model.ts               类型、组件目录、文档约束、预览校验
  schema.ts              安全解析、旧格式迁移、Schema 导出
  store.ts               原子编辑事务、嵌套操作、历史、持久化
  App.tsx                工作模式、快捷键、导入导出、拖放
  components/
    Library.tsx          组件库与结构树
    Canvas.tsx           设计画布与嵌套布局
    Inspector.tsx        字段、表单、选项及显示规则配置
    FieldControl.tsx     设计与预览共享的控件
    Preview.tsx          填写、校验、结果展示
    SchemaEditor.tsx     按需加载的代码编辑器
    ui.tsx               可复用控件与原生 dialog
  styles.css             设计变量、三栏工作台与响应式布局
  model.test.ts          Schema 与表单语义回归
  store.test.ts          状态事务与历史回归
```

## 验证

```sh
pnpm test
pnpm build
pnpm format:check
```

自动测试覆盖全组件往返、旧格式迁移、无效导入不覆盖、重复标识、默认值类型、条件显隐、嵌套移动防循环、整树复制引用重映射、删除 / 重命名引用维护、历史分支和持久化。浏览器流程与已验证范围见 `docs/verification.md`。
