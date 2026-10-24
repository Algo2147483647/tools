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

[Appearance protocol v2 proposal](appearance-protocol-v2.md) records the proposed JSON-first standardization. It is a design document, not an accepted import format. Do not use its proposed field names in current style files.

## Source of truth

- [Graph JSON Schema](../public/graph.schema.json) documents graph structure; runtime validation performs additional semantic checks.
- [Graph types](../src/graph/types.ts) define chart IDs and document types.
- [Style file parser](../src/state/chartStyleFile.ts) defines the accepted appearance file envelope.
- [Chart defaults](../src/state/chartStyles.ts) define chart-specific initial styles.

Older guides are retained in `docs/tmp` during documentation reorganization. The chart and appearance references above replace their overlapping material; archived defaults and relative links may be outdated.
