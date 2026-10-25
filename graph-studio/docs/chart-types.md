# Chart Types and the Shared Data Protocol

Graph Studio provides five chart types over one versioned graph document. Choose a type in **Settings > Chart type**. A chart determines how data becomes geometry; the Node-link layout engine is a separate choice.

## Choosing a chart

| UI name          | Chart ID    | Positioning model                                              | Suitable data                                  | Guide                            |
| ---------------- | ----------- | -------------------------------------------------------------- | ---------------------------------------------- | -------------------------------- |
| Node-link        | `node-link` | Directed relationships arranged into layers                    | Dependencies, concepts, processes              | [Reference](charts/node-link.md) |
| Nested node-link | `compound`  | Relationships inside nested containment scopes                 | Systems, services, organizational structure    | [Reference](charts/compound.md)  |
| Sankey           | `sankey`    | Bars and bands scaled by numeric flow                          | Material, energy, traffic, allocation          | [Reference](charts/sankey.md)    |
| Timeline         | `timeline`  | Calendar or relative time plus tracks or relationship channels | Events, intervals, histories, schedules        | [Reference](charts/timeline.md)  |
| Spatial          | `spatial`   | Explicit coordinates projected onto the screen                 | Maps, point sets, multidimensional coordinates | [Reference](charts/spatial.md)   |

Switching chart type does not convert or rewrite the graph. Each type retains its own style profile. Selecting Sankey requires valid numeric flow values; labels are not converted into quantities. Node-link remembers its engine when switching away and back.

## Document envelope

The Schema panel under **Settings > Chart type** presents one continuous three-rule table. Parent fields precede their children, including Timeline clock, event-time, and relationship-anchor fields; there are no separate thematic tables. Requirement and description have independent columns, and cells remain on one line with horizontal scrolling when needed.

Its **Current JSON** view shows the current graph document, including unsaved edits, with Copy JSON and Download JSON actions. **Appearance > Schema > Current JSON** shows the current style configuration. Neither view substitutes a fixed example or stores rendered geometry.

The following is a complete graph file:

```json
{
  "format": "graph-studio",
  "version": 3,
  "id": "delivery",
  "title": "Delivery process",
  "nodes": {
    "request": { "title": "Request", "type": "Input" },
    "build": { "title": "Build", "type": "Process", "define": "Prepare the result." }
  },
  "edges": [{ "id": "request-build", "source": "request", "target": "build", "value": "starts" }]
}
```

| Path                       | Type                                    | Requirement and meaning                                                                |
| -------------------------- | --------------------------------------- | -------------------------------------------------------------------------------------- |
| `format`                   | `"graph-studio"`                        | Required, exact string.                                                                |
| `version`                  | `3`                                     | Required number. Other protocol versions are rejected.                                 |
| `id`, `title`              | String                                  | Optional document identity and title.                                                  |
| `diagram`                  | `"dag"` or `"sankey"`                   | Optional data semantics. There is no `"timeline"`, `"compound"`, or `"spatial"` value. |
| `metadata`                 | Object                                  | Optional document extensions, including chart hints and a style reference.             |
| `nodes`                    | Object keyed by node ID                 | Required. Empty objects are valid.                                                     |
| `nodes[id].title`          | String                                  | Optional visible title; ID remains the stable identifier.                              |
| `nodes[id].define`         | String                                  | Optional Markdown description.                                                         |
| `nodes[id].type`           | String                                  | Optional category for filtering and coloring.                                          |
| Other node fields          | JSON values                             | Preserved custom data, subject to reserved-field and chart-specific checks.            |
| `edges`                    | Array                                   | Required ordinary relationships; may be empty.                                         |
| `edges[].id`               | String                                  | Required, unique within ordinary edges.                                                |
| `edges[].source`, `target` | Node IDs                                | Required, existing, distinct endpoints. Direction is significant.                      |
| `edges[].value`            | String, finite number, boolean, or null | Optional relation value. Sankey requires a nonnegative number.                         |
| `edges[].metadata`         | Object                                  | Optional edge extensions.                                                              |
| `hierarchy_edges`          | Array of `{ id, source, target }`       | Optional parent-to-child membership; see [Compound](charts/compound.md).               |

IDs must be nonempty, have no surrounding whitespace, and contain no commas or line breaks. Use unique JSON object keys; duplicate keys may be overwritten by JSON parsing before validation can inspect them.

## Structural validation

- Unknown top-level and ordinary-edge fields are rejected. Put extensions in `metadata`.
- Stored node fields `key`, `parents`, and `children` are reserved and rejected. Relationship indexes are derived from `edges`.
- Self-loops and duplicate directed endpoint pairs are rejected. Opposite directions are distinct pairs.
- Ordinary directed cycles are allowed. Containment cycles are not.
- Missing relation values display as `related_to`; this fallback is not written into the source file.
- Legacy node maps, array envelopes, field aliases, and the old `hierarchy` object are not accepted.
- Invalid graph structure does not replace the open document. Timeline has a deliberate exception for malformed event-time evidence: it can remain inspectable as undated data.

The [JSON Schema](../public/graph.schema.json) and runtime importer complement one another. Endpoint existence, unique pairs, containment consistency, finite Sankey totals, and coordinate counts require runtime checks.

## Initial chart selection

On document load, chart hints are evaluated in this order:

1. A `metadata.space` object selects Spatial.
2. A `metadata.timeline` object selects Timeline.
3. Nonempty `hierarchy_edges` selects Nested node-link.
4. `diagram: "sankey"` selects Sankey.
5. Otherwise, Node-link is selected.

Hints select a view; they do not relax data validation. For example, `diagram: "sankey"` still requires valid flow quantities even if another hint takes precedence. Prefer a clear intended view when publishing a graph and its linked style.

## Data, styles, and view state

| Concern                                                 | Current location                                   |
| ------------------------------------------------------- | -------------------------------------------------- |
| Nodes, relationships, containment, times, coordinates   | Graph JSON                                         |
| Portable chart appearance and supported layout controls | Separate `graph-studio-style` file                 |
| Reference to a style file                               | Graph `metadata.style`, relative to the graph file |
| Chart preferences                                       | Browser preferences, independently per chart       |
| Spatial camera and projection controls                  | Session view state                                 |
| Nested expansion and focus                              | Document-specific view preferences                 |
| Saved Arrange plans                                     | Independent JSON referenced by `metadata.layout`   |

Graph documents can currently contain chart-specific visual data, such as Sankey node `color` and Spatial `spatialStyle`. These are documented exceptions to the general data/style separation.

A graph references a style through `metadata.style: "styles/delivery.style.json"`. Open the workspace folder to resolve it; opening a single file does not grant access to sibling files. See [Appearance](appearance.md) for a complete style example and failure behavior.

## Saving and export

Saving graph JSON preserves original data and metadata, not a filtered or collapsed screen projection. SVG exports the current rendered scene. Interactive HTML exports a read-only scene with pan, zoom, and node details; it does not reproduce every chart's editor, layout engine, or camera controls.

## Implementation references

[Types](../src/graph/types.ts), [normalization](../src/graph/normalize.ts), [serialization](../src/graph/serialize.ts), [chart schema shown in Settings](../src/schema/document/definition.ts), and [linked style resolution](../src/workspace/linkedStyle.ts).
