# Tools

独立运行的工具集合。Windows 启动环境统一由 [`scripts/node-runtime.ps1`](scripts/node-runtime.ps1) 管理，各应用只保留自己的构建和服务命令。

## Windows 一键启动

在仓库目录运行：

```powershell
.\launch.cmd svg-studio
.\launch.cmd service-flow-editor
.\launch.cmd form-studio
.\launch.cmd asset-dashboard
```

也可以继续双击各项目里的 `launch.cmd`，或者从其他目录用绝对路径运行。

| 项目 | 默认入口 | 开发模式 |
| --- | --- | --- |
| SVG Studio | http://127.0.0.1:4173/（开发服务） | 同默认 |
| Service Flow Editor | http://127.0.0.1:4319/（构建后启动） | `-Dev`，4320 |
| Form Studio | http://127.0.0.1:4174/（构建后预览） | `-Dev`，5173 |
| Asset Dashboard | http://127.0.0.1:3000/（开发服务） | 同默认 |

通用选项：`-InstallOnly` 仅准备依赖；`-BuildOnly` 仅构建；`-Preview` 构建后运行；`-NoBrowser` 不自动打开浏览器。Asset Dashboard 的入口地址在终端显示，不自动打开浏览器。

```powershell
.\launch.cmd svg-studio -InstallOnly
.\launch.cmd svg-studio -BuildOnly
.\launch.cmd form-studio -Dev -NoBrowser
```

## 共用环境逻辑

- 查找 PATH 中的 Node.js 22.12+；回退到现有 Codex 自带运行时和标准 Node 安装目录。
- 自动查找 npm / pnpm 的 CLI 和 Windows 包装命令。npm 缺失时可使用 Codex 自带 pnpm，无需修改全局 PATH 或另装 Node。
- npm 项目以 `package-lock.json` 为准：npm 可用时使用 `npm ci`；否则从 npm 锁文件转换后用 pnpm 的冻结锁文件安装。生成的 pnpm 锁文件只作本地缓存，不提交。
- pnpm 项目以自己的 `pnpm-lock.yaml` 为准；若机器只有 npm，则通过 `npm exec` 使用项目指定版本的 pnpm，无需全局安装。
- 不合并各项目的 `node_modules`，避免 React 版本等相互冲突。pnpm 会通过自己的内容寻址缓存复用下载。
- 根据清单、锁文件、项目配置、Node ABI 和平台生成安装记录。依赖变化、安装中断或模块缺失会重新安装；安装成功并通过加载检查后才写入记录。
- pnpm 生命周期脚本按项目 `pnpm-workspace.yaml` 显式允许所需的 esbuild、fsevents 或 unrs-resolver，没有全局放开构建脚本。

若机器既没有可用 Node，也没有 Codex 运行时，安装官方 Node.js LTS 后重新打开终端即可。首次依赖安装需要网络，后续启动复用本地依赖。

静态 HTML 项目（complex-transform、formula-to-markdown、implicit-surface）不需要 Node 启动器，沿用各自说明。

Service Flow Editor 的 macOS 入口 `launch.command` 同样改为调用外层 `scripts/node-runtime.sh`，支持 npm 缺失时使用 pnpm。此次在 Windows 上验证；macOS 启动流程未做实机验证。

## 环境回归检查

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\test-node-runtime.ps1
```

覆盖没有 Node/npm/pnpm PATH 的回退、路径空格、npm→pnpm 回退、重复运行缓存、依赖变化、失败重试和不完整安装检测。
