# Settings presentation

`appearanceUIConfig.ts` describes control order, grouping, chart applicability and
layout variants. Schema owns values, defaults, supported fields and validation;
do not duplicate those rules in the presentation configuration.

- `AppearanceUIOutlet` filters unsupported or unmatched controls and empty groups.
- `AppearanceUIRenderers` adapts Schema bindings to reusable controls. Row variants
  (`colors`, `border`, `typography`) describe layout, independently of control IDs.
- `TitleFormatControl` handles title alignment/overflow and font style through
  explicit `format` options. Its configuration children declare searchable fields.
- `AppearanceSettings` owns the validated transaction boundary. All changes use
  the existing style history, including CSS and section resets.
- `SettingsModal` owns the shared CSS draft. `AppearanceCssEditor` is used in both
  Nodes and Advanced; changing tabs never creates an independent copy of the CSS.
  Apply commits once; Undo/Redo synchronize the draft from the committed style.

CSS editors start at one line and can be resized vertically. Keep editor styling
in `styles/settings/css-editor.css`, reusable row layouts in
`styles/settings/appearance-layout.css`, and tuple/range controls in
`styles/settings/tuple-editor.css`. Avoid selectors tied to configuration IDs.

When adding controls, provide accessible labels, preserve the common reset and
commit behavior, and verify filtering and narrow layouts. Contract regressions
live in `src/test/appearanceContract.test.ts`; browser checks should cover shared
drafts, Apply/Undo/Redo, manual resizing and horizontal overflow.
