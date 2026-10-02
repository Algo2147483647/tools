# Usage Guide

This guide covers the main workflows for using DAG Studio in the browser.

## Running the App

```powershell
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. On first load, the app shows the welcome page without loading a graph.

## Editing

The app opens in Edit mode. Graph edits, the console, undo, redo and saving are available directly.

## Controls

The Settings button opens a searchable dialog with five sections:

- Workspace: open files/folders, recent locations, manifest export, and console visibility
- Chart type: Node-link or Sankey, with numeric-flow requirements shown before switching
- Layout: BFS, Sugiyama or Dagre for Node-link; automatic flow arrangement for Sankey
- Appearance: a separate live preview, presets, colors, typography, visible details and custom CSS for each chart type
- AI assistant: provider, model, API key, execution mode, and connection test

AI providers include OpenAI-compatible endpoints, DeepSeek, Anthropic, Gemini, and Ollama.

For the full graph UI configuration model, see [Graph Appearance System](graph-appearance.md).

## Opening graphs and workspaces

Use Open graph file for one document or Open workspace for a folder. A workspace lists independent v3 graph documents; it does not merge their contents. The app remembers recent locations and the last selected graph in each workspace. New graph creates an unsaved document with one starter node.

The home page shows recent workspaces and graph files together in a timeline on the left, grouped by local date and ordered by last opened time. Open actions remain on the right. Each location appears once; reopening updates its time. Removing an entry only removes it from Recents.

A root graph-studio.workspace.json manifest can specify graph files and a default graph. Without it, the app detects native v3 JSON documents. Multiple graphs without a clear default remain in the explorer for selection. Invalid files show an error; opening does not modify source files. See the [Workspace Guide](workspaces.md) for the full discovery contract and browser permission behavior.

Local links resolve only inside an open workspace, relative to the source JSON or Markdown file. Resolve Path has been removed.

## Navigation

After loading JSON, the renderer finds roots by looking at incoming indexes computed from the document’s edges.

- If there is one root node, that node becomes the focused root.
- If there are multiple root nodes, DAG Studio renders them as a forest.
- Clicking a node focuses that node or subtree.
- `Back` returns to the previous focus selection.
- `Up` renders the current node's parent level.
- If a node has multiple parents, the parent level is shown as a forest.

## Type Filtering

The top bar's `Type` selector lists the non-empty types in the current graph, using the fixed `type` field. Select a type to display its nodes across the whole graph. Paths through hidden nodes become `filtered_path` links between the nearest visible nodes; existing direct links keep their original relation values.

`All types` and `Back` leave the filtered view. `Show all roots` clears the filter and shows the complete graph. While filtering, clicking highlights a node and double-clicking opens its details; `Up` is disabled. If the selected type disappears after an edit or import, the selector returns to `All types` automatically.

Filtering does not alter source data: JSON saves contain the complete graph, while SVG export reflects the currently displayed view.

## Chart Types and Layouts

`Node-link` displays relationships as nodes and connecting lines. Its layouts are:

- `BFS` keeps the selected traversal close to breadth-first discovery order.
- `Sugiyama layered` ranks nodes by dependency depth and applies crossing reduction before rendering.
- `Dagre layered` uses Dagre's layered engine for a library-backed dependency layout.

`Sankey` displays non-negative numeric edge values as proportional flow bands, using an automatic flow layout. Its layout controls adjust bar width, vertical spacing and label room. Text relationships cannot be converted to flows by switching chart type. Invalid values disable Sankey with an explanation.

`Nested node-link` uses an independent containment hierarchy and rounded, orthogonal connections. It supports expanding, collapsing, entering and editing arbitrarily nested subgraphs. See [Nested node-link](compound.md).

Changing chart type preserves the graph document and its edit history. Switching back to Node-link restores the selected BFS, Sugiyama or Dagre layout. Opening a document with H selects Nested node-link; other Sankey documents select Sankey, and ordinary documents select Node-link.

## Graph Appearance

The `Appearance` settings tab controls the current graph UI independently from the graph JSON data.

Key workflows:

- `Advanced appearance -> Import` loads a graph appearance JSON file.
- `Advanced appearance -> Export` downloads the current graph appearance as JSON.
- `Advanced appearance -> Reset` restores the default graph appearance.
- `Presets` applies built-in looks such as `simple`, `compact`, `default`, `slate`, `blueprint`, `contrast`, and `presentation`.
- `Colors` edits common `--dag-*` CSS variables without writing CSS.
- `Custom CSS` replaces the graph CSS block used by the renderer and SVG export.
- The separate `Layout` category adjusts spacing, node height, width, and stage minimums.

Each chart type independently remembers its appearance, dimensions, visibility settings and custom CSS across refreshes. Appearance imports, exports, presets, reset and appearance undo/redo apply to the active type. Sankey opacity is in Appearance; bar width is in Layout. Existing shared appearance preferences migrate to both types on first load. Appearance is not embedded into saved graph JSON.

## Dense Graph Hover Mode

When the visible stage gets large, DAG Studio automatically uses a lower-cost hover rendering path so linked highlighting stays usable.

The dense-stage threshold is triggered when any one of these is true:

- `220` or more visible nodes
- `440` or more visible edges
- `stageWidth * stageHeight >= 20,000,000`

Dense hover mode keeps the same interaction semantics:

- the hovered node still highlights
- adjacent nodes still highlight
- related edges still highlight
- unrelated nodes and edges are still deemphasized

To reduce repaint cost, the app disables the most expensive hover-only visual effects in this mode, especially shadow filters and transition animations.

## Editing in the UI

Graph editing is available directly.

Right-click a node to open details, rename its ID, or delete it. **Connections** contains incoming/outgoing relationship editing and creation of a connected node. **Copy & paste** contains ID/JSON copying, duplication and pasting with a connection. Ordinary node-link also offers **Delete reachable nodes** under Connections; it follows G's directed edges.

In Nested node-link, **Subgraph membership** groups siblings, moves members to another subgraph, or promotes them one level. Right-click a collapsed summary, an expanded group header/border, or a Subgraphs panel row to operate on that group. Its menu supports entry, folding, renaming, member creation/grouping, movement and **Ungroup · keep members**. Ungrouping promotes its members and retains all G nodes and relationships.

Blank canvas menus create or paste nodes in the currently focused scope. Adding a node to a group records its creation and membership in one undo step. Membership changes do not create G relationships. Move dialogs exclude the member itself and its descendants.

Press **Shift+F10** on a focused graph node or group header to open its menu. Hover or click a section to open its submenu; the target remains visible in the main menu. Submenus switch sides near the viewport edge and use a single-panel view when space is limited. Arrow Up/Down and Home/End navigate items, Right opens a section, and Left or Escape returns from it. Escape at the main menu closes it and restores focus. Typing the start of a label jumps to that action. Disabled actions explain why they are unavailable.


## View Node

`Open details` opens a generic node detail view. It shows:

- every key-value pair in the node
- the `define` field as readable text
- custom node fields, preserving their JSON value types
- the node's raw JSON

Node fields use fixed semantic names (`title`, `define`, `type`). Raw editing and copy/paste use `{ "id": "A", "data": { ... } }`; relationships are edited separately through Connections → Edit incoming/outgoing relationships and stored in `edges`.

## Graph Console

In `Edit` mode, use the `Graph console` switch in Workspace settings to open the left-side console.

The console is designed for fast text-based graph and appearance edits:

- one line is one instruction
- multiple lines run as one batch
- console commands start with `/`
- plain text input is sent to AI when AI is enabled
- AI may automatically run read-only commands in `Ask` mode to inspect graph data, but edit commands still require an auto-edit execution mode
- successful graph mutation batches commit as a single graph undo step
- successful appearance mutation batches commit as a single appearance undo step
- parse or execution errors stop at the first failing line
- command history is available with the arrow keys when suggestions are not open
- `/clear` or `/cls` clears console output
- `/help` prints the command reference directly in the console
- `/keys` lists every node key in the current graph
- `/graph` summarizes graph size, roots, leaves, and node types
- `/find <query>` searches node keys, titles, types, definitions, and custom fields
- `/neighbors <node> [depth]` inspects local parent/child structure
- `/path <from> <to>` finds the shortest directed path
- `/layout <key> <number>` changes one layout tuning value
- `/style-var <var> <value>` changes one `--dag-*` CSS variable
- `/style-css show`, `/style-css append <css>`, and `/style-css replace <css>` inspect or update custom graph CSS
- `/style-preset <id>` applies a built-in appearance preset
- `/style-reset` restores the default graph appearance

Common commands:

- `/help`
- `/keys`
- `/graph`
- `/find <query>`
- `/neighbors <node> [depth]`
- `/path <from> <to>`
- `/use <node>`
- `/show <node>`
- `/json <node>`
- `/mv <old-key> <new-key>`
- `/rm <node>` or `/rm -r <node>`
- `/add <new-key>` or `/add <new-key> -p <parent>`
- `/cp <source> <new-key>` or `/cp <source> <new-key> -p <parent>`
- `/parents <node> = A,B`
- `/children <node> = A,B`
- `/set <node> <field> "value"`
- `/style-preset contrast`
- `/layout rowGap 28`
- `/style-var --dag-edge-active #ff6b35`

For the full command reference, see [Graph Console DSL](graph-console-dsl.md).

## Undo and Redo

Edit history is separate from navigation history.

- `Back` restores the previous focus selection.
- `Undo` and `Redo` apply to graph data edits and appearance edits.
- Graph edit history is preferred when both graph and appearance undo records are available.
- Supported edit actions include add, delete, rename, field edits, and relation edits.
- Supported appearance actions include settings changes, presets, reset, layout commands, CSS variable commands, and CSS replacement.
- Imported appearance JSON is sanitized and recorded as one appearance edit.
- Creating a new edit after `Undo` clears the redo stack.

Keyboard shortcuts:

- `Ctrl+Z` or `Cmd+Z`: undo
- `Ctrl+Shift+Z` or `Cmd+Shift+Z`: redo
- `Ctrl+Y`: redo
- `Ctrl+S` or `Cmd+S`: open the JSON save dialog in `Edit` mode

Shortcuts are ignored while typing in editable controls.

## Saving and Export

The top bar includes `Save JSON`.

Available actions:

- `Overwrite Original`: write the edited JSON back to the source file
- `Save New Copy`: download a timestamped JSON file
- `Cancel`: close the dialog

Default new-file naming:

```text
original-name-YYYYMMDD-HHMMSS.json
```

Direct overwrite uses the browser File System Access API. When file access is unavailable, saving a new copy remains available.

Saving behavior notes:

- `Overwrite Original` does not show an extra app confirmation after the save dialog action; the browser may still ask for write permission
- `Save New Copy` does not mark the original source file as clean
- saving retains the full v3 envelope, node fields, edge IDs, and document/edge metadata
- derived relation indexes and Type projection links are not serialized

The app also supports exporting the current view as SVG. SVG export includes the current graph CSS and `--dag-*` appearance variables.

Appearance export is separate from graph saving:

- `Appearance -> Advanced appearance -> Export` downloads the current UI configuration as JSON.
- `Appearance -> Advanced appearance -> Import` loads a previously exported UI configuration JSON file.
- `Appearance -> Advanced appearance -> Reset` restores the default UI configuration.
- `Save JSON` saves graph data only.
