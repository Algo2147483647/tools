# Verification notes

Environment: Windows, Node.js 24.19, pnpm 11.19; 2026-09-28.

## Automated regression

`pnpm test`: 23 tests covering component round trips, legacy migration, invalid imports, reserved properties, default types, duplicate keys, nested layouts, visibility conditions, validation, subtree duplication, reference updates, cycle prevention, history limits and persistence. Label layout tests cover export/import round trips, old v2 defaults and legacy horizontal layouts.

The English starter migration tests verify that an untouched legacy example is upgraded with its IDs preserved. Changes to content, validation, field order or appearance prevent migration. New English documents are left unchanged.

`pnpm build`: strict TypeScript checks and a Vite production build.

`pnpm format:check`: source and documentation formatting.

## English UI and layout checks

### Floating glass workspace

- The brand block and canvas metadata are removed. The canvas fills the window beneath independently positioned top, left and right glass surfaces.
- At 320, 390, 760, 1024 and 1440 pixels wide, the toolbar stays on one row without horizontal overflow. Its height is 50 pixels on narrow screens and 56 pixels on desktop.
- At 1440 × 900, the toolbar's top offset and both sidebars' bottom gaps are zero. All 17 components fit without library scrolling in compact 35-pixel rows. The search field stays above the scroll area. Search, click-to-add and undo were checked again after this change.
- At 320 × 740, the toolbar top offset remains zero, the component drawer reaches the bottom edge and the page has no horizontal overflow.
- Clear/frosted glass and canvas dots persist after reload.
- Inline labels and controls share a row in design and preview. Required-field validation and successful response data remain correct.
- The inline default applies to a newly created blank template. Undo restores the previous form; reload preserves the form layout and the new-form default.
- Mobile component and inspector drawers open and close from the single-row toolbar.

### Independent settings page

- Settings now opens a full page with five sections and direct hash addresses. No settings dialog is used. Desktop section links, phone section selection and the Back to editor action were checked.
- Refreshing `#/settings/appearance` restores that section. Browser back and forward switch between the visited settings sections correctly.
- Focus canvas changes the panel state without leaving settings; Show panels restores it. Each section moves keyboard focus to its heading.
- An unapplied Schema draft survives entering settings and returning to the editor.
- Layout cards include a form example. Settings were visually checked at 1440 × 900 and 390 × 844. Workspace and keyboard shortcut sections have no horizontal overflow at 320 × 740; the desktop navigation also fits at 768 × 900.

### Earlier English UI checks

- Desktop at 1440 × 960: blue workspace, compact header, editable title and independent sidebar collapse/reopen.
- Tablet at 1024 × 768: library remains visible; inspector opens and closes as a drawer. No page overflow.
- Phones at 390 × 844 and 320 × 740: responsive header and canvas, no horizontal page or canvas overflow.
- Header title edit commits on Enter; Undo restores the original title.
- Inspector properties and conditions use English labels, operators and help text.
- Empty preview submission produces three English required-field errors. Filling in name, email and role produces the expected JSON response, including the Boolean subscription value.
- Schema round trip applies successfully. Invalid JSON produces an English error and leaves the seven-field form intact.
- Mobile library search, adding an email field, closing the library and opening the inspector work.
- Template dialog and feedback template use English copy; template replacement can be undone.
- Existing untouched Chinese starter is upgraded on load. Custom documents remain unchanged.

## Earlier regression checks

The preceding version was also checked for conditional visibility during entry, moving a date field into and out of a section, keyboard field reordering, rename/undo and draft restoration after refresh. Core model and store tests continue to cover these behaviors.

## Scope

Preview submission is a local demonstration, without server delivery. No cross-browser certification or comprehensive WCAG audit is claimed. Browser storage failures prompt users to export a backup. The Chinese strings in `src/compat/legacy-starter.json` are intentional matching data for the old example, not interface copy.
