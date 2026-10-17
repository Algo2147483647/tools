# Graph Studio

Graph Studio is a browser-based graph viewer and lightweight JSON editor for directed graphs, nested graphs, Sankey diagrams, and event timelines.

It is built for fast graph inspection and editing in the browser:

- load a JSON graph and render it immediately
- validate versioned graph documents and resolve multi-file conflicts before importing
- navigate by root, subtree, or parent level
- explore and edit arbitrarily nested subgraphs with the independent Nested node-link chart type ([guide](docs/compound.md))
- explore events on a true UTC time axis, with Git-style branching, duration bars, track filtering, and editable event times ([guide](docs/timeline.md))
- edit nodes and relationships directly in the UI
- batch graph edits from a text console in `Edit` mode
- undo and redo graph mutations without losing navigation history
- save the updated graph back to JSON or export the current view as SVG
- export the current canvas as a standalone interactive HTML file with read-only node details

![Graph Studio screenshot](./docs/assets/screenshot.png)

## Quick Start

### Interactive HTML export

Open **Settings → Files → Export interactive HTML** after a graph has rendered. The single HTML file contains the current view's layout, styles, visible node fields and visible relationships. It opens without Graph Studio or a network connection and has no app toolbar, workspace explorer or console.

- Click a node to select it; double-click, press Enter or choose **Node details** to open its detail page.
- The detail page includes Markdown fields, formulas, raw JSON and links to related nodes in the exported view. Escape returns to the canvas.
- Drag to pan, scroll or pinch to zoom. With the canvas focused, use `+` / `-` to zoom, arrow keys to pan and `0` to fit the complete exported view.

The export is a read-only snapshot: filtered nodes, nodes inside collapsed groups, linked workspace files and embedded images are not bundled. Expand groups before export to include their nodes. Group containers retain their displayed title and can be selected, but their layout cannot be expanded or edited in the exported file. External references remain links; opening them requires a connection. Fonts use the recipient's installed fonts.

For development, `/browser-tests/html-export.html` serves a fixed-data interaction fixture through Vite, covering selection, details, Markdown/math, relationships and zoom without opening local user files.

### One-click startup (Windows / macOS)

- **Windows:** double-click [`launch.cmd`](launch.cmd), or run it from any directory. [`launch.ps1`](launch.ps1) selects Node.js 22.12+, including an existing Codex runtime, and skips older installations on PATH.
- **macOS:** install Node.js 22.12+ including npm, then double-click [`launch.command`](launch.command). If copied from Windows or an archive without executable permissions, run `chmod +x launch.command` once. You can also run `bash launch.command` in Terminal. Homebrew installations in `/opt/homebrew` and `/usr/local` are detected.

Both entry points use [`scripts/launch.mjs`](scripts/launch.mjs) to install and verify dependencies, start the app, and open your browser. They work from any directory and do not require files outside this project. The server listens on `127.0.0.1` only. Keep the terminal window open; press `Ctrl+C` to stop. The first launch requires internet access. Do not copy `node_modules` between Windows and macOS.

On both platforms, npm is preferred; when npm is missing, the launcher imports `package-lock.json` into a local pnpm lockfile and installs with pnpm. Successful installations are fingerprinted and verified on every launch, including the native esbuild binary. Changes to dependencies, runtime, platform, or install configuration trigger a reinstall. `package-lock.json` is the authoritative lockfile; generated `pnpm-lock.yaml` is ignored. Close running Graph Studio servers before updating dependencies, and run only one dependency installation at a time.

Windows startup options:

```powershell
.\launch.cmd -InstallOnly  # Prepare dependencies without starting the server
.\launch.cmd -BuildOnly    # Check TypeScript and build the app
.\launch.cmd -NoBrowser    # Start without opening a browser
.\launch.cmd -Preview      # Build and serve the production app
.\launch.cmd -Help         # Show options
```

Equivalent macOS options:

```bash
bash launch.command --install-only
bash launch.command --build-only
bash launch.command --no-browser
bash launch.command --preview
bash launch.command --help
```

Development mode is the default (`-Dev` / `--dev`). Select only one of development, install-only, build-only, or preview; `-NoBrowser` / `--no-browser` can be combined with a server mode.

From the repository root, `.\launch.cmd graph-studio` uses the same launcher (and accepts the same options). The development server ignores `dist` so a concurrent production build does not interrupt file watching on Windows.

### Manual startup

```powershell
npm ci
npm start
```

`npm start` uses the same verified startup flow. After installing dependencies, `npm run dev` starts Vite directly for development. Node.js 22.12+ is required for all workflows.

Useful commands:

```powershell
npm run build
npm test
```

The app starts on a welcome page. Open a graph file, open a folder as a workspace, reopen a recent location, or explore an independent example workspace:

- **Mathematics:** 112 concepts, eight subject views, and linked English notes adapted from `math/studio`.
- **Factorio production:** two demand-driven Space Age 2.0.65 Sankey plans: one complete launch-ready rocket per second, or all 12 science packs simultaneously at one of each per second. Both trace production back to raw resources.
- **Commerce operations:** nested groups and relationships across order fulfillment and returns.
- **World space history:** one complete timeline with 298 sourced events and phases and 408 relationships, including Apollo 11's branching flights. Filter by theme, track or time range within the same graph.

Examples open fresh editable copies and can be reopened from Recents without folder permissions. The canvas fills the window, with the `math/studio` glass toolbar and workspace panels floating above it. Fit uses the area visible beside the panels; panning can move the graph beneath them.

Factorio values are calculated per-second material flows, including batch yields, built-in machine productivity, biological fuel, credited coproducts and catalyst/coolant returns. Surplus output is explicit. These aggregate material plans exclude power, heating, transport, spoilage in transit, construction and launch scheduling. See [Example workspaces](docs/examples.md) for sources, assumptions and regeneration.

Graph documents use the strict Graph Studio v3 envelope: `format`, `version`, `nodes`, and `edges`. Custom document and edge fields live in `metadata`; node fields retain arbitrary JSON values. Legacy formats and field aliases are rejected.

## What You Can Do

- inspect and edit v3 graphs directly
- initialize a blank canvas with one starter node
- focus a node, move back through focus history, or move up to parent levels
- work with multiple roots as a forest
- switch chart type between `Node-link`, `Nested node-link`, `Sankey`, and `Timeline`, each with its own saved appearance
- arrange Node-link charts with `BFS`, `Sugiyama` or `Dagre`; Sankey uses automatic flow layout
- configure node shadows in Appearance settings, with live preview and SVG export
- visualize numeric flows using the optional v3 `diagram: "sankey"` protocol ([example](public/sankey-example.json))
- inspect every node field in a generic node viewer
- edit relationships, rename nodes, duplicate nodes, or delete a node or subtree
- use the graph console for batch edits with undoable transactions
- save over the original JSON when file access is available, or download a new copy

## Documentation

- [Documentation Index](docs/index.md): overview of the available project docs
- [Workspace Guide](docs/workspaces.md): opening modes, recent locations, discovery manifest, and local links
- [Usage Guide](docs/usage.md): UI workflows, navigation, editing, saving, and layouts
- [Data Format Guide](docs/data-format.md): v3 document contract, metadata, validation, and import conflict strategies
- [Graph Console DSL](docs/graph-console-dsl.md): command reference for the edit-mode console
- [Development Guide](docs/development.md): local scripts, source layout, and implementation notes

## Minimal Example

```json
{
  "format": "graph-studio",
  "version": 3,
  "nodes": {
    "A": { "title": "Root", "type": "Concept" },
    "B": { "title": "Child", "type": "Theorem" }
  },
  "edges": [
    { "id": "edge-ab", "source": "A", "target": "B", "value": "supports" }
  ]
}
```

For the recommended data model and additional examples, see [Data Format Guide](docs/data-format.md).

## Project Structure

| Location | Contents |
| --- | --- |
| `launch.cmd`, `launch.ps1`, `launch.command` | Platform startup entry points |
| [`src/`](src/) | React/TypeScript source and styles; regression suites in `src/test/` |
| [`browser-tests/`](browser-tests/) | Browser-only regression fixtures, excluded from production builds |
| [`public/`](public/) | Runtime static assets, graph schema, and example workspaces |
| [`scripts/`](scripts/) | Startup, cleanup, example generators, and generator input data in `scripts/data/` |
| [`docs/`](docs/) | User/developer documentation and documentation images |
| Root configuration files | npm lockfile, TypeScript, Vite, formatting, and line-ending rules |

`node_modules/`, `dist/`, caches, test output, and logs are generated files and are ignored by Git. Run `npm run clean` to remove build/test output and root diagnostic logs; use `npm run clean -- --cache` to also remove local npm/example-source caches. Cleanup preserves dependencies, source, documentation, and example workspaces. See the [Development Guide](docs/development.md) for details.

## License

MIT License. See [LICENSE](LICENSE) for details.
