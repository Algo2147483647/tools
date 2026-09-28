# Form Studio

An English visual form builder with a component library, live canvas and property inspector. Its blue palette, translucent panels and compact toolbar follow SVG Studio's visual language. Everything runs in your browser; preview responses are never sent to a server.

## Run

On Windows, double-click `launch.cmd` or run:

```powershell
D:\xiongzihao\tools\form-studio\launch.cmd
```

The launcher uses the repository's shared `scripts/node-runtime.ps1`. It discovers Node.js 22.12+ and npm or pnpm, including bundled runtimes, installs missing dependencies, checks TypeScript and builds the app. It opens `http://127.0.0.1:4174/`. Keep the terminal open; press Ctrl+C to stop. SVG Studio uses port 4173 so both can run together.

```powershell
.\launch.cmd -Dev          # Development server on port 5173
.\launch.cmd -NoBrowser    # Start without opening a browser
.\launch.cmd -BuildOnly    # Type-check and build only
```

For manual development or other operating systems:

```sh
pnpm install --frozen-lockfile
pnpm dev
pnpm build
pnpm preview
```

Serve the app over HTTP rather than opening `index.html` directly. Deploy `dist/` to a static web server. Relative asset paths support subdirectory hosting.

## Workspace

- **Design:** Click or drag one of 17 components onto the canvas. Configure labels, field keys, descriptions, defaults, options, validation and layout in the inspector.
- **Panels:** Collapse either sidebar to make room for the canvas. Smaller screens use drawers. Use the panel buttons above the canvas to reopen them.
- **Document title:** Rename the form in the header. Enter saves; Escape cancels. Form settings also expose the title, description, submit label, success message and accent color.
- **Structure:** Select nested fields in the tree. Change the parent container in the inspector to move fields between sections, grids and accordions. Grids support 1–4 columns.
- **Conditions:** Show fields when all or any conditions match. Operators include equals, does not equal, contains, empty and not empty. Renaming and deleting fields updates their references.
- **Preview:** Test desktop and phone widths, fill out the form and validate a response. Copy or download the resulting JSON for integration work.
- **Schema:** Edit JSON with CodeMirror highlighting, folding and diagnostics. Apply validates the document before updating the canvas. Invalid imports leave the current form intact.
- **Templates:** Start from a blank form, event registration or feedback survey. Template replacement can be undone.
- **Import/export:** JSON files up to 2 MB are supported. Imports can be undone. Export a backup if browser storage is unavailable.
- **History:** Up to 80 undo steps, grouped consecutive edits and persistent local drafts. Refresh restores the saved document.

The interface, templates, default labels and validation messages are English. Custom form content is preserved in its original language. Only a completely unchanged Chinese starter from the previous release is upgraded to the English example; every authored value is compared before replacement.

## Keyboard shortcuts

| Action                         | Shortcut                          |
| ------------------------------ | --------------------------------- |
| Undo                           | Ctrl/⌘ + Z                        |
| Redo                           | Ctrl/⌘ + Shift + Z                |
| Duplicate selected field       | Ctrl/⌘ + D                        |
| Delete selected field          | Delete                            |
| Export schema                  | Ctrl/⌘ + S                        |
| Search components              | /                                 |
| Clear selection / close drawer | Escape                            |
| Reorder selected field         | Focus its drag handle, then ↑ / ↓ |

Text inputs retain their native editing shortcuts.

## Schema compatibility

The internal document uses `version: 2`. Exports retain the original `{ form, schema: { properties } }` shape with `x-component`, `x-component-props` and `x-visibility`. The `x-studio` extension preserves appearance, document copy, field IDs and widths.

Legacy Input, Textarea, InputNumber, Select, Radio, Checkbox, Switch, Cascader, DatePicker, TimePicker, ColorPicker, Slider, Card, Grid, Collapse and Divider components can be imported. Option values, defaults, visibility, disabled and read-only states are preserved. Empty validator arrays and `ruleKey: required` are supported. Duplicate legacy names are disambiguated using property keys; invalid keys produce an error. Static Collapse panels become read-only child fields, and absolute Grid slots become a sequential grid.

Unknown components, custom `x-reactions` and custom validators must be converted before import. Schema scripts are never executed. Containers do not produce data; responses are flat objects keyed by globally unique field names. Hidden, disabled and conditionally excluded fields are omitted.

`x-studio` and `x-visibility` are project-specific extensions. Other Formily runtimes need component mappings and condition adapters. Server collection, accounts, public publishing and cloud synchronization are outside this app's scope.

## Development

React 19, TypeScript 7, Vite 8, Zustand 5, Zod 4, dnd-kit, CodeMirror 6 and Lucide. Exact versions are locked in `pnpm-lock.yaml`. Fonts use a system fallback stack; there are no runtime CDN dependencies.

```text
src/
  model.ts                 Types, component catalog and validation
  schema.ts                Safe parsing, legacy migration and export
  store.ts                 Transactions, nesting, history and persistence
  starter-upgrade.ts       Exact-match upgrade of the old bundled example
  compat/legacy-starter.json  Original example for migration matching
  App.tsx                  Modes, panels, shortcuts, import/export and drag/drop
  components/              Library, canvas, inspector, preview and schema editor
  styles.css               Visual tokens and responsive workspace
  *.test.ts                Model, store and migration regression tests
```

```sh
pnpm test
pnpm build
pnpm format:check
```

See [verification notes](docs/verification.md) for tested workflows and limitations.
