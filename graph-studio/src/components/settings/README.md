# Settings presentation

`appearanceUIConfig.ts` describes control order, grouping and chart applicability.
Schema owns values, defaults, supported fields and validation; do not duplicate
those rules in the presentation configuration.

- `AppearanceUIOutlet` filters unsupported or unmatched controls and empty groups.
- `settingsSearch.ts` provides case-insensitive, whitespace-separated word matching
  for both the settings catalog and rendered controls.
- `AppearanceUIRenderers` adapts Schema bindings to reusable controls. Panels group
  searchable fields without adding layout wrappers; sections provide headings.
- `TitleFormatControl` handles title alignment and overflow. `FontSizeStyleControl`
  combines size and bold/italic controls for all font roles, including timeline axis, tracks and dates. Their configuration
  children declare searchable fields; font properties still use Schema bindings.
- `AppearanceSettings` owns the current model and validated transaction boundary.
  Presets and Schema read that model's style rather than rebuilding it in the view.
- `SettingResetContext` omits per-field reset buttons in Appearance groups. Section
  resets remain available, and other editors retain their individual reset buttons.
- `SettingsModal` owns the shared CSS draft. `AppearanceCssEditor` is used in both
  Nodes and Advanced; switching tabs does not create another draft. Apply commits
  once; Undo/Redo synchronize the draft from the committed style.

Canvas, Nodes and Edges share aligned label/value rows without column headings or
row borders. A light divider separates sections. Width ranges stay on one row.
Keep this layout and its narrow-screen rules in `styles/settings/appearance-layout.css`.
Reusable control styling belongs in `controls.css`; the opaque white settings shell
belongs in `shell.css`. CSS editors start at one line, can be resized vertically,
and keep their styling in `css-editor.css`.

When adding controls, provide accessible labels, preserve the transaction boundary,
and verify filtering and narrow layouts. Contract regressions live in
`src/test/appearanceContract.test.ts`; browser checks should cover editing,
Apply/Undo/Redo, shared drafts, width ranges and horizontal overflow.

Color inputs display six-digit RGB hex; opacity is edited independently. Both the
picker and text field preserve opacity through the same commit path. Stored color
strings remain CSS values so rendering and protocol validation share one format.
Edge label typography uses Schema font roles. Rendering and compound routing share
`layout/shared/edge-label.ts`; routing boxes are centered on the label position.
The label border toggle controls only stroke width, retaining background fill.

Settings previews always use the fixed fixtures in `previewGraphs.json`; the open
document and its current viewport are never preview inputs. `AppearancePreview`
uses the same layout engines, paint pass and `GraphStage` as the main canvas.
`AppearancePreviewFrame` owns only presentation and preview camera controls.
Overview is the default; Detail frames the longest visible leaf title. Tab changes
do not change the chosen preview mode. Compound navigation resets within the sample.

Fixture coverage:

| Chart            | Demonstrated cases                                                                                             |
| ---------------- | -------------------------------------------------------------------------------------------------------------- |
| Node-link        | Typed and untyped nodes, long titles, descriptions, branches, labeled return edges                             |
| Nested node-link | Expanded and folded groups, group statistics, cross-group links, category colors                               |
| Sankey           | Unequal flows, split/merge, return flow, titles and numeric values                                             |
| Timeline         | Two tracks, points and overlapping intervals, dates, descriptions, labeled relations, calendar/relative clocks |
| Spatial          | Four 3D points, multiple categories, solid/hollow markers, opacity, solid/dashed directed links                |

Use conditional controls to reveal the corresponding fixture features; do not
force descriptions, edge labels or shadows on against the selected settings.
Keep category paint and custom CSS precedence identical in preview and main canvas.
