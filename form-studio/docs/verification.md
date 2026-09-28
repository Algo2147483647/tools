# Verification notes

Environment: Windows, Node.js 24.19, pnpm 11.19; 2026-09-28.

## Automated regression

`pnpm test`: 20 tests covering component round trips, legacy migration, invalid imports, reserved properties, default types, duplicate keys, nested layouts, visibility conditions, validation, subtree duplication, reference updates, cycle prevention, history limits and persistence.

The English starter migration tests verify that an untouched legacy example is upgraded with its IDs preserved. Changes to content, validation, field order or appearance prevent migration. New English documents are left unchanged.

`pnpm build`: strict TypeScript checks and a Vite production build.

`pnpm format:check`: source and documentation formatting.

## English UI and layout checks

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
