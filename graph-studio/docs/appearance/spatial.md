# Spatial Appearance

Portable files use `chartType: "spatial"`. Spatial appearance currently has three owners: the shared style profile, graph-level per-element visual data, and session view controls. Read the [shared style protocol](../appearance.md) and [Spatial coordinate protocol](../charts/spatial.md).

## Ownership map

| Concern                                                                      | Current location                | Saved by style export?  |
| ---------------------------------------------------------------------------- | ------------------------------- | ----------------------- |
| Shared text/edge tokens and CSS                                              | `style.appearance`              | Yes                     |
| Point color, radius, opacity, hollow state, label priority                   | `nodes[id].spatialStyle`        | No; saved in graph JSON |
| Edge color, width, dash, arrow visibility                                    | `edges[].metadata.spatialStyle` | No; saved in graph JSON |
| Legend                                                                       | `metadata.spatialLegend`        | No; saved in graph JSON |
| Coordinates and category membership                                          | Node data and `metadata.space`  | No; saved in graph JSON |
| Projection, camera, axes, labels, grid, back-point visibility, display units | `SpaceView` session state       | No                      |

## Shared profile

Settings exposes primary text color, default/active edge tokens, font family/size/weight/style, edge labels, presets, and custom CSS. Some per-edge inline styles take precedence over shared edge tokens. The Spatial default title size is 12 px, descriptions default to hidden, and the only built-in preset is Default.

Cards, card shadows, equal card widths, rounded corners, and ordinary card border settings are not Spatial point controls. The shared file still carries their fields for compatibility. Spatial also omits the ordinary layout-dimension sliders because coordinate projection supplies geometry.

The following is a complete portable style file:

```json
{
  "format": "graph-studio-style",
  "version": 1,
  "chartType": "spatial",
  "style": {
    "showNodeDetail": false,
    "hideNodeBorders": true,
    "alignNodeWidthsToMax": false,
    "appearance": {
      "version": 1,
      "layout": {},
      "display": { "showEdgeLabels": false },
      "cssVars": {
        "--dag-title-font-size": "12px",
        "--dag-title-font-family": "Inter, sans-serif",
        "--dag-text-strong": "#334155"
      },
      "css": ".dag-graph[data-layout=\"spatial\"] .spatial-label { stroke-width: 2px; }"
    }
  }
}
```

## Point style protocol

Fields below live in `nodes[id].spatialStyle`. Optional invalid values fall back or are clamped by the rendering helper; this is not the strict coordinate validation contract.

| Field           | Accepted value                  | Behavior                                                                                             |
| --------------- | ------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `color`         | Six-digit hex string            | Overrides the generated category point color.                                                        |
| `radius`        | Finite number, clamped to 1-12  | Logical point radius. Absent values use automatic sizing.                                            |
| `opacity`       | Finite number, clamped to 0.1-1 | Base opacity, further modulated by depth.                                                            |
| `hollow`        | Boolean                         | Draws an outline rather than a filled point.                                                         |
| `label`         | Boolean                         | Requests ordinary label display in dense scenes, subject to view settings and collision suppression. |
| `labelPriority` | Finite number; fallback 0       | Larger values receive earlier consideration during label placement.                                  |

Category colors derive from the full source graph for stability under filtering. Larger points also receive priority during collision handling. The Labels switch governs ordinary labels; focused/hovered points can reveal their labels through interaction CSS even when the normal label is suppressed.

## Edge style protocol

Fields below live in `edges[].metadata.spatialStyle`:

| Field      | Accepted value                             | Behavior                  |
| ---------- | ------------------------------------------ | ------------------------- |
| `color`    | Six-digit hex string                       | Explicit edge color.      |
| `width`    | Finite number, clamped to 0.5-8; default 1 | Logical stroke width.     |
| `dashed`   | Boolean; false                             | Dashed path.              |
| `directed` | Boolean; false                             | Displays an arrow marker. |

Edges remain directed graph relationships even when their Spatial arrow is hidden. Per-edge stroke values are supplied inline; shared edge CSS tokens do not necessarily override them. Line thickness here is decorative, unlike quantitative Sankey band width.

## Legend protocol and complete graph example

`metadata.spatialLegend` requires a string `title` and an `items` array to be displayed. `description` is optional. Each usable item has a string `label` and finite `radius`, with optional `opacity` and `hollow`. The same radius/opacity clamping applies. The legend is descriptive metadata; it does not compute styles or enforce a data encoding.

```json
{
  "format": "graph-studio",
  "version": 3,
  "metadata": {
    "space": { "dimensions": 2, "coordinateSystem": "cartesian" },
    "spatialLegend": {
      "title": "Measurements",
      "description": "Hollow points indicate missing measurements.",
      "items": [
        { "label": "Measured", "radius": 5, "opacity": 0.8, "hollow": false },
        { "label": "Missing", "radius": 3, "opacity": 1, "hollow": true }
      ]
    }
  },
  "nodes": {
    "a": {
      "title": "A",
      "space": [0, 0],
      "spatialStyle": { "color": "#2563eb", "radius": 5, "opacity": 0.8, "label": true, "labelPriority": 10 }
    },
    "b": { "title": "B", "space": [2, 1], "spatialStyle": { "radius": 3, "hollow": true } }
  },
  "edges": [
    {
      "id": "ab",
      "source": "a",
      "target": "b",
      "metadata": { "spatialStyle": { "color": "#64748b", "width": 2, "dashed": true, "directed": true } }
    }
  ]
}
```

## Session view model

The internal `SpaceView` has `axes: [number, number, number]`, `projection: "orthographic" | "perspective" | "map"`, `yaw`, `pitch`, `labels`, `grid`, `hideBackPoints`, and optional `unitScale`. Axis indices are zero-based converted coordinate dimensions. Map projection is available for spherical/geographic coordinates.

Defaults are orthographic projection, zero yaw/pitch, labels/grid on, and back points visible. Axis defaults are `[0, 1, 2]`, or `[1, 2, 0]` for spherical/geographic outside-globe orientation. `unitScale` is limited to 0.1-100 relative to automatic coordinate spacing.

These fields are documented to explain behavior, not as accepted fields in a portable style file. Reset view changes session state; resetting Appearance does not reset the camera or rewrite data styles.

## CSS and export

Use `.dag-graph[data-layout="spatial"]` with `.spatial-point`, `.spatial-label`, `.spatial-selection`, `.spatial-guides`, or ordinary edge selectors. Labels use shared title tokens and a white stroke halo. Guides currently use dedicated CSS rather than a public JSON grid-style object.

Style export alone is insufficient to recreate point/edge styling that lives in graph data. Share both graph and style when required. SVG/HTML capture the current projection and visual marks; interactive HTML does not add the editor's 3D camera controls.

Sources: [style interpretation and legend](../../src/layout/spatial-layout.ts), [point renderer](../../src/rendering/SpatialNode.tsx), [edge renderer](../../src/rendering/GraphEdge.tsx), [session defaults](../../src/graph/space.ts), [Spatial CSS](../../src/styles/spatial.css).
