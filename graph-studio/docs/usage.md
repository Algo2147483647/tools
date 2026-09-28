# Usage Guide

This guide covers the main workflows for using DAG Studio in the browser.

## Running the App

```powershell
npm install
npm run dev
```

Open the local Vite URL shown in the terminal. On first load, the app automatically opens [`public/example.json`](../public/example.json).

## Main Modes

- `Preview` mode is for safe browsing and inspection.
- `Edit` mode enables graph mutation, the console sidebar, undo and redo, and save operations.

The app remembers page preferences such as mode and layout selection across refreshes.

## Controls

The top bar controls button opens a settings dialog with three sections:

- `General`: mode, console visibility, initialization, field mapping, SVG export, JSON file import, folder import, and status
- `Appearance`: UI configuration import/export/reset, layout engine, layout tuning, presets, tokens, custom CSS, title styling, detail visibility, borders, and width behavior
- `AI`: provider, model, API key, execution mode, and connection test

AI providers include OpenAI-compatible endpoints, DeepSeek, Anthropic, Gemini, and Ollama.

For the full graph UI configuration model, see [Graph Appearance System](graph-appearance.md).

## Loading and Starting Graphs

You can work from sample data or start from scratch.

- The default sample graph is loaded automatically on page load.
- `Initialize Canvas` creates a new blank graph with a single centered root node named `Initial_Node`.
- A newly initialized graph is treated as unsaved until you export or save it as JSON.

## Field Mapping

Each opened JSON file is interpreted using a field mapping.

- DAG Studio first tries to infer the document's own schema from its field names
- if a file uses default fields such as `children`, `define`, and `type`, the default mapping is used
- if a file uses custom fields such as `next`, `description`, or `kind`, the app can map those roles automatically
- different files may therefore show different active mappings

The `Field Mapping` dialog changes how the current document is interpreted in the UI. It does not rename fields in the source JSON just by saving the mapping.

## Navigation

After loading JSON, the renderer finds roots by looking at both parent links and incoming edges inferred from child links.

- If there is one root node, that node becomes the focused root.
- If there are multiple root nodes, DAG Studio renders them as a forest.
- Clicking a node focuses that node or subtree.
- `Back` returns to the previous focus selection.
- `Up` renders the current node's parent level.
- If a node has multiple parents, the parent level is shown as a forest.

## Layout Modes

- `BFS` keeps the selected traversal close to breadth-first discovery order.
- `Sugiyama layered` ranks nodes by dependency depth and applies crossing reduction before rendering.
- `Dagre layered` uses Dagre's layered engine for a library-backed dependency layout.

## Graph Appearance

The `Appearance` settings tab controls the current graph UI independently from the graph JSON data.

Key workflows:

- `UI Configuration -> Import` loads a graph appearance JSON file.
- `UI Configuration -> Export` downloads the current graph appearance as JSON.
- `UI Configuration -> Reset` restores the default graph appearance.
- `Presets` applies built-in looks such as `simple`, `compact`, `default`, `slate`, `blueprint`, `contrast`, and `presentation`.
- `Tokens` edits common `--dag-*` CSS variables without writing CSS.
- `Custom CSS` replaces the graph CSS block used by the renderer and SVG export.
- `Layout Tuning` adjusts spacing, node height, width, and stage minimums.

Appearance changes are remembered across refreshes in page preferences. They are not embedded into saved graph JSON.

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

Switch to `Edit` mode to enable graph editing.

Right-click a node to access:

- `View Node`
- `Copy Key`
- `Copy Node`
- `Add Child Node`
- `Edit Children`
- `Edit Parents`
- `Rename Node Key`
- `Delete Node`
- `Delete Subtree`

Behavior notes:

- `Copy Node` duplicates the selected node's non-relation fields into a new node.
- `Add Child Node` creates a node and links it as a child immediately.
- `Rename Node Key` prevents duplicate keys.
- `Delete Node` removes the node and clears references from other nodes.
- `Delete Subtree` removes the selected node and all descendants.
- `Edit Parents` and `Edit Children` update the graph and rerender immediately.
- `View Node` in edit mode also supports field-by-field editing and raw JSON editing.

In `Preview` mode, edit-only actions stay disabled while non-destructive actions remain available.

## View Node

`View Node` opens a generic node detail view. It shows:

- every key-value pair in the node
- the mapped description field as readable text
- the mapped parent and child relation fields as relation sets
- the node's raw JSON

The viewer is schema-agnostic, so custom node fields are preserved and still inspectable. Field labels prefer the real JSON field name. When a custom field is acting as a graph-aware role, the UI may show it like `description (define)`.

## Graph Console

In `Edit` mode, use `Show Console Sidebar` from the controls panel to open the left-side console.

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
- saving preserves the document's active field names instead of rewriting them back to system names
- changing field mapping affects interpretation, not the literal JSON keys written to disk

The app also supports exporting the current view as SVG. SVG export includes the current graph CSS and `--dag-*` appearance variables.

Appearance export is separate from graph saving:

- `Appearance -> UI Configuration -> Export` downloads the current UI configuration as JSON.
- `Appearance -> UI Configuration -> Import` loads a previously exported UI configuration JSON file.
- `Appearance -> UI Configuration -> Reset` restores the default UI configuration.
- `Save JSON` saves graph data only.
