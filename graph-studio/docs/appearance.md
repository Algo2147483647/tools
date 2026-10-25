# Appearance

Appearance is a JSON protocol. CSS is a rendering extension inside the protocol. The canonical contract drives TypeScript models, validation, defaults, the editable Schema table, ordinary controls, preset documents, and storage.

| Chart            | Reference                                       | Supported geometry                                              |
| ---------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Node-link        | [Node-link Appearance](appearance/node-link.md) | Layered nodes, spacing, size, and edge lanes.                   |
| Nested node-link | [Compound Appearance](appearance/compound.md)   | Hierarchical cards, groups, and color ramps.                    |
| Timeline         | [Timeline Appearance](appearance/timeline.md)   | Time-axis layouts, event labels, bars, markers, and anchors.    |
| Sankey           | [Sankey Appearance](appearance/sankey.md)       | Quantitative bands, bar width, label room, and shared palettes. |
| Spatial          | [Spatial Appearance](appearance/spatial.md)     | Shared padding and minimum stage size around data coordinates.  |

Open **Settings → Appearance → Schema** to inspect or edit current protocol values. Use **Update current appearance** to write the current complete Schema document beside the graph and set its `metadata.style` relative path. Save the graph to persist that link. An existing `metadata.style` target is overwritten in place. Without a link, a new style file is created and its path is bound. **Nodes**, **Edges**, and **Text** show supported fields generated from the same definitions. **Nodes** owns width ranges, height, spacing, Sankey bar width and Timeline cross-axis spread. **Edges** owns edge-lane spacing. **Canvas** owns padding and minimum canvas size. **Layout** contains arrangement rules: the Node-link algorithm, and Timeline direction, Tracks/Flow, routing and time-axis behavior. **Advanced** contains custom CSS, density policy, and full reset.

Every field edit uses the same validation as importing a style file. Invalid values show an error and retain the previous value. Unsupported shared fields are read-only in Schema and omitted from ordinary controls. Boolean values use switches. Presets store full schema documents; their IDs and labels are external catalog metadata.

Font sizes use pixels so measurement and rendering agree. Category palettes, nested group ramps, interaction opacity, edge widths, and dash patterns are configurable. The custom stylesheet is applied after built-in styles through an explicit cascade layer. Saved styles contain custom CSS only, not a snapshot of application CSS.

See [Canonical Appearance Schema](appearance-schema.md) for ownership, precedence, validation, and maintenance. The five chart references contain generated field tables and complete examples.

Appearance edits and undo history are session-only. Browser preferences do not save or restore styles, including legacy cached styles. Opening another graph resets styles to defaults, then loads its linked style if present. Appearance and Schema have no Preset selectors or standalone style export.

Update is available whenever a graph is open. Local workspaces write directly through their granted directory access. Built-in examples served by the local development or preview server use its same-origin style endpoint, writing to the graph's folder without a picker. Existing metadata.style paths are overwritten; new links use a sibling JSON file. A separately imported file without folder access cannot write sibling files and reports that limitation instead of opening a picker.
