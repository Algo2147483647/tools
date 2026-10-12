# JSON Studio

本地 JSON 工作台，由原始单文件 HTML 整理为独立项目。保留原有英文界面、纸张风格和功能，使用原生 JavaScript ES Modules；运行时不依赖框架、CDN 或第三方包。

## 启动

Windows 双击本目录的 `launch.cmd`，或在 tools 根目录运行：

```powershell
.\launch.cmd json-studio
```

默认打开 <http://127.0.0.1:4189/>。保持终端开启，按 `Ctrl+C` 停止服务。启动器优先使用 PATH 中的 Node.js 20+，也会查找现有 Codex 运行时及标准 Node 安装目录；不会修改全局 PATH。

在本项目目录可运行：

```powershell
.\launch.cmd -NoBrowser          # 仅启动服务
.\launch.cmd -Port 4200          # 自定义端口
.\launch.cmd -BuildOnly          # 语法检查、单元测试、生成 dist
.\launch.cmd -Preview            # 检查并构建，再提供 dist 预览
.\launch.cmd -InstallOnly        # 检查运行环境；没有运行依赖需要安装
```

`-Dev` 与默认启动行为相同；修改静态文件后刷新页面即可。

其他系统或手动启动（Node.js 20+）：

```sh
node server.mjs
node server.mjs --port 4200
```

请通过 HTTP 地址访问，不能直接双击 `public/index.html`：浏览器需要通过 HTTP 加载 ES Modules 和模块 Worker。

## 功能与数据

- 格式化、压缩、转义/反转义、Unicode 转换、递归键排序、数组反转。
- 树视图、格式化视图、表格视图；搜索、源代码定位、节点编辑、表格排序与筛选。
- 多文档标签页、独立撤销/重做、文件导入及下载，最多同时打开 12 个文档。
- 结构差异比较，可选择忽略对象键顺序。
- JSONPath 查询：属性、索引、通配符、递归下降、切片和过滤表达式。
- JSON Schema 2020-12 的有限子集校验，支持本地 `$ref`；完整支持范围见界面中的说明，不支持的关键字会明确报错。
- 可调整分栏、代码字号和换行，支持移动端布局及键盘操作。

自定义 JSON 语法树保留数字原文、重复键和对象键顺序，例如 `9007199254740993` 不会经过 JavaScript 浮点数转换。Schema 校验要求对象键唯一。JSONPath 为自定义实现的子集，不承诺完整标准兼容。

编辑内容和分析均在浏览器本地内存中完成，服务端只提供静态文件，不上传或保存 JSON。刷新或关闭页面后不会恢复文档，需要保留的数据请使用 **Download JSON** 导出。

沿用原版保护限制：单份 JSON 最多 2,097,152 个 UTF-16 代码单元、50,000 个节点、128 层嵌套；后台分析超过 3 秒会终止。大文本会降级为纯文本显示。

## 开发与验证

启动、构建和核心测试不需要安装依赖。格式化和浏览器测试使用锁定版本的开发依赖：

```sh
npm ci
npm run check
npm run format:check
npm run test:e2e
npm run build
npm run preview
```

开发命令需要 PATH 中有 Node.js 20+。`npm run format` 统一格式；`npm run check` 检查脚本语法并执行 Node 内置测试。单元测试覆盖数字精度、重复键、解析限制、转换、编辑、Diff、JSONPath、Schema 和静态服务边界。

浏览器测试默认使用本机 Chrome，验证编辑/撤销、错误恢复、表格、模块 Worker、多文档、导入导出和移动布局。如无 Chrome，可安装 Playwright Chromium：

```powershell
npx playwright install chromium
$env:PLAYWRIGHT_CHANNEL = 'chromium'
npm run test:e2e
```

浏览器测试使用独立端口 4190，避免与默认服务冲突。

## 目录

```text
public/
  index.html                 页面结构及 SVG 图标
  styles.css                 界面样式和响应式布局
  src/
    app.js                   页面状态、编辑器、视图和交互
    json-core.js             保留数字原文的解析、序列化和转换
    editor-core.js           语法高亮、括号配对和缩进
    studio-core.js           节点编辑、数字比较、Diff、JSONPath、Schema
    analysis.js              可独立测试的分析任务入口
    analysis-worker.js       模块 Worker 消息处理
scripts/
  check.mjs                  语法检查和核心测试
  build.mjs                  将静态资源复制到 dist
tests/
  core.test.mjs              核心逻辑回归测试
  server.test.mjs            静态服务器测试
  workspace.spec.mjs         浏览器流程测试
server.mjs                   仅监听 127.0.0.1 的静态服务器
launch.cmd / launch.ps1      Windows 启动入口
playwright.config.mjs       浏览器测试配置
```

构建不转译或打包 JavaScript，`dist/` 可部署到静态 HTTP 服务器或其子目录。页面和 Worker 使用相对资源路径。构建会重新生成本项目的 `dist/`，不要把手工文件放进去。

## 整理范围

源文件为 `粘贴的文本 (1)(3).txt`，原文件未修改。将内嵌 HTML、CSS、JavaScript 拆分并统一格式，显式声明模块依赖；原先从页面脚本文本拼接的 Blob Worker 改为独立模块 Worker，保留取消任务、过期结果丢弃和超时处理。补齐本地服务、Windows 启动器、格式配置、锁文件、构建与测试，不做框架重写。
