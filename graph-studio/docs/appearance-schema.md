# Canonical Appearance Schema

Appearance has one protocol for built-in presets, saved preferences, linked style files, editable Schema tables, and JSON export. There is no legacy format migration.

## Document and model

```ts
interface ChartStyleDocument {
  format: "graph-studio-style";
  version: 1;
  chartType: GraphChartType;
  style: ChartStyle;
}
```

`src/schema/appearanceModel.ts` defines the document and all nested model types. `ChartStyle`, `GraphAppearance`, and `TimelineViewSettings` are members of that same model, not alternate storage formats. Renderers and editing history use these nested values directly.

`src/schema/appearanceSchema.ts` supplies the field definitions, required markers, enum choices, current values, and examples. `src/schema/styleProtocol.ts` uses those definitions to validate imports, exports, presets, and persisted styles. A field edit passes through the same validator as a file import.

| Consumer             | Canonical value                              | Behavior                                                        |
| -------------------- | -------------------------------------------- | --------------------------------------------------------------- |
| Built-in preset      | `preset.document: ChartStyleDocument`        | Preset identity and label remain outside the protocol document. |
| Browser preferences  | `chartStyles[chartType]: ChartStyleDocument` | Every chart stores its full document.                           |
| Timeline preferences | `chartStyles.timeline.style.timeline`        | No duplicate top-level Timeline preference object.              |
| Linked file          | `ChartStyleDocument`                         | Validated before its `style` is used by the current chart.      |
| Schema table         | `ChartStyleDocument`                         | Displays and edits the same current values.                     |
| Example and export   | `ChartStyleDocument`                         | JSON serialization performs no field-name conversion.           |
| Layout and rendering | `document.style` and its nested types        | Geometry consumes the canonical properties directly.            |

## Arrays and validation

`style.appearance.layout.stagePadding` is a two-number tuple `[x, y]` everywhere, including renderers and the console command `/layout stagePadding [32, 48]`. Separate X/Y property names are not accepted.

Objects are closed except the documented CSS-variable, type-color, and node-pin maps. Unknown properties, incorrect types, invalid enum values, mismatched chart identifiers, and malformed tuples fail validation. Missing required fields fail validation; omitted optional fields receive the selected chart's schema defaults. Exported and persisted documents contain the complete resolved values.

CSS variables require `--dag-` names and string values of at most 500 characters. Stylesheets are limited to 50,000 characters and cannot contain `@import`. The parser rejects invalid content instead of silently rewriting it.

Invalid saved style documents reset to the selected chart's default document. They are not migrated. Invalid imported files are rejected without replacing the current style. Session-specific Timeline pins, lock state, and document color categories are excluded from browser-wide preference saving.

## Maintaining the contract

Update the canonical model, field definitions, and chart defaults together. Do not introduce export adapters that rename internal fields or secondary preset payloads. Tests verify preset/document equality, all bundled style files, preference round trips, shared-default isolation, editor validation, and obsolete-field rejection.
