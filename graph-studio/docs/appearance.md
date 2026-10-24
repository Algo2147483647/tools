# Appearance

Appearance is a JSON protocol. CSS is a rendering extension inside the protocol. The canonical contract drives TypeScript models, validation, defaults, the editable Schema table, ordinary controls, preset documents, and storage.

| Chart | Reference | Supported geometry |
| --- | --- | --- |
| Node-link | [Node-link Appearance](appearance/node-link.md) | Layered nodes, spacing, size, and edge lanes. |
| Nested node-link | [Compound Appearance](appearance/compound.md) | Hierarchical cards, groups, and color ramps. |
| Timeline | [Timeline Appearance](appearance/timeline.md) | Time-axis layouts, event labels, bars, markers, and anchors. |
| Sankey | [Sankey Appearance](appearance/sankey.md) | Quantitative bands, bar width, label room, and shared palettes. |
| Spatial | [Spatial Appearance](appearance/spatial.md) | Shared padding and minimum stage size around data coordinates. |

Open **Settings → Appearance → Schema** to inspect or edit current protocol values. Select a preset above the table. **Nodes**, **Edges**, and **Text** show supported fields generated from the same definitions. **Layout** exposes geometry fields. **Advanced** contains custom CSS, density policy, import, export, and full reset.

Every field edit uses the same validation as importing a style file. Invalid values show an error and retain the previous value. Unsupported shared fields are read-only in Schema and omitted from ordinary controls. Boolean values use switches. Presets store full schema documents; their IDs and labels are external catalog metadata.

Font sizes use pixels so measurement and rendering agree. Category palettes, nested group ramps, interaction opacity, edge widths, and dash patterns are configurable. The custom stylesheet is applied after built-in styles through an explicit cascade layer. Saved styles contain custom CSS only, not a snapshot of application CSS.

See [Canonical Appearance Schema](appearance-schema.md) for ownership, precedence, validation, and maintenance. The five chart references contain generated field tables and complete examples.
