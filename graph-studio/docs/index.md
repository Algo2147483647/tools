# Graph Studio Documentation

This reference describes the behavior and file formats implemented in the current source tree. Graph data uses **Graph Studio v3**. Portable appearance files use **graph-studio-style v1** and contain **GraphAppearance v1**. These version numbers identify different contracts.

## Chart types

Start with [Chart types and the shared data protocol](chart-types.md), then read the guide for the selected chart.

| Chart                         | Data and behavior                      | Appearance and style protocol                         |
| ----------------------------- | -------------------------------------- | ----------------------------------------------------- |
| Node-link                     | [Node-link](charts/node-link.md)       | [Node-link appearance](appearance/node-link.md)       |
| Nested node-link (`compound`) | [Nested node-link](charts/compound.md) | [Nested node-link appearance](appearance/compound.md) |
| Sankey                        | [Sankey](charts/sankey.md)             | [Sankey appearance](appearance/sankey.md)             |
| Timeline                      | [Timeline](charts/timeline.md)         | [Timeline appearance](appearance/timeline.md)         |
| Spatial                       | [Spatial](charts/spatial.md)           | [Spatial appearance](appearance/spatial.md)           |

## Appearance

[Appearance and the shared style protocol](appearance.md) defines the current file envelope, shared fields, CSS integration, defaults, validation, persistence, and export behavior. Chart-specific pages explain which fields actually affect each renderer.

[Canonical Appearance Schema](appearance-schema.md) describes the single protocol shared by presets, models, storage, validation, and rendering. Old appearance protocols are not supported.

## Source of truth

- [Layout architecture](layout-architecture.md) maps chart-specific layout pipelines, shared types, text measurement and Worker boundaries to the source tree.
- [Graph JSON Schema](../public/graph.schema.json) documents graph structure; runtime validation performs additional semantic checks.
- [Graph types](../src/graph/types.ts) define chart IDs and document types.
- [Style protocol](../src/schema/styleProtocol.ts) validates the canonical appearance document for imports, exports, presets, and storage.
- [Chart defaults](../src/schema/chartStyles.ts) define chart-specific initial styles.

Older guides are retained in `docs/tmp` during documentation reorganization. The chart and appearance references above replace their overlapping material; archived defaults and relative links may be outdated.
