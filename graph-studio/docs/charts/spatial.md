# Spatial

Spatial renders nodes at explicit coordinates. It supports zero, one, two, three, and higher input dimensions, with selectable projection axes. It does not infer positions from relationships or invent a dimensional embedding.

Select **Settings > Chart type > Spatial**, or provide `metadata.space` to open in Spatial automatically. The chart ID is `spatial`.

## Document example

```json
{
  "format": "graph-studio",
  "version": 3,
  "metadata": {
    "space": {
      "dimensions": 3,
      "coordinateSystem": "cartesian",
      "axes": ["X", "Y", "Z"],
      "unit": "m"
    }
  },
  "nodes": {
    "origin": { "title": "Origin", "type": "Reference", "space": [0, 0, 0] },
    "sample": { "title": "Sample", "type": "Measurement", "space": [1, 2, 3] },
    "pending": { "title": "Unpositioned", "type": "Measurement" }
  },
  "edges": [{ "id": "origin-sample", "source": "origin", "target": "sample" }]
}
```

## Coordinate protocol

| Path                              | Type                     | Rule/default                                                                   |
| --------------------------------- | ------------------------ | ------------------------------------------------------------------------------ |
| `metadata.space.dimensions`       | Nonnegative safe integer | Required number of source coordinates. No fixed 3D/4D cap.                     |
| `metadata.space.coordinateSystem` | Listed below             | Required coordinate interpretation.                                            |
| `metadata.space.angleUnit`        | `degrees`, `radians`     | Optional; defaults to degrees.                                                 |
| `metadata.space.axes`             | String array             | Optional; exactly one label per source dimension.                              |
| `metadata.space.unit`             | String                   | Optional linear-unit display label.                                            |
| `metadata.space.radius`           | Positive finite number   | Geographic reference sphere radius; default 6371.                              |
| `metadata.space.typeField`        | Nonempty string          | Optional node field holding multiple category memberships.                     |
| `metadata.space.edgeTypeField`    | Nonempty string          | Optional edge metadata field used for category filtering.                      |
| `nodes[id].space`                 | Array of finite numbers  | Exactly `dimensions` entries when positioned. Missing coordinates are allowed. |

| Coordinate system | Coordinate order                        | Minimum dimensions |
| ----------------- | --------------------------------------- | ------------------ |
| `cartesian`       | `[x, y, z, ...]`                        | 0                  |
| `polar`           | `[radius, azimuth, ...]`                | 2                  |
| `spherical`       | `[radius, azimuth, elevation, ...]`     | 3                  |
| `cylindrical`     | `[radius, azimuth, height, ...]`        | 3                  |
| `geographic`      | `[longitude, latitude, altitude?, ...]` | 2                  |

Radii are nonnegative. Elevation is measured from the XY plane, not from the north pole. Latitude/elevation must lie within -90 to 90 degrees, or -pi/2 to pi/2 radians. Geographic altitude must remain above the sphere center. Reference radius and altitude use the same linear unit; the default 6371 corresponds to kilometers when used as an Earth approximation.

Malformed metadata, incorrect coordinate counts, and invalid numeric/angular values are rejected with field paths. Missing coordinates remain in an unpositioned tray. The scalar positive-integer `space` used by Timeline is a different contract; a Spatial document uses arrays.

## Dimensional behavior and projections

- **0D:** coordinates are `[]`. An index tray separates coincident nodes for inspection and has no distance meaning.
- **1D:** coordinates lie on one measured line.
- **2D:** Cartesian plots preserve coordinate aspect ratio.
- **3D:** orthographic or perspective projection supports rotation and tilt.
- **Higher dimensions:** select three converted Cartesian dimensions for View X/Y/Z. Unselected coordinates remain stored. Overlap in one projection does not imply identical source points.
- **Spherical/geographic map:** an equirectangular projection is available. Edges crossing the longitude seam split at the boundary. A flat degree map is not a ground-distance scale.

Non-Cartesian prefixes are converted before projection. Extra dimensions remain selectable. Globe edges are straight chords, not geodesics. Geographic rendering uses a sphere rather than an ellipsoidal geodesy model.

## View controls

Rotate, Tilt, projection, axis selection, Labels, Grid, Hide back points, and Display units are session controls. They do not modify coordinates or enter the portable `ChartStyle` file.

Display units changes coordinate spacing relative to automatic scale, between 0.1 and 100 times that scale. Unlike camera zoom, it does not proportionally enlarge text, point radii, or strokes. Reset view restores automatic spacing and orientation.

In 3D, dragging rotates; Shift-drag, right-drag, or middle-drag pans. In flat views, normal dragging pans. Wheel/pinch zooms. Tap/click selects; double-click or Enter opens details. Hide back points removes rear-facing points and incident edges in globe views; it is inactive in map projection.

## Categories and data-driven styling

Ordinary `type` determines category color and filtering. Multi-membership datasets can declare `typeField: "lines"` and store node `lines: ["Blue", "Green"]`; `edgeTypeField: "line"` reads the service from `edges[].metadata.line`. This lets shared nodes participate in multiple categories while filtering edges by their own membership.

The chart also accepts per-node `spatialStyle`, per-edge `metadata.spatialStyle`, and an optional `metadata.spatialLegend`. These fields live in graph data and affect only Spatial. Their full field reference and example are in [Spatial appearance](../appearance/spatial.md).

Filtering keeps original edges between visible endpoints. Color assignment and coordinate scaling use the full source document for stability. Editing coordinates validates before commit and supports graph undo/redo; new Spatial nodes start with zero coordinates.

## Export

Graph JSON retains source coordinates, not their projected screen positions. SVG captures the current projection. Interactive HTML preserves the rendered snapshot with pan/zoom/details, but does not include Spatial camera rotation controls.

Implementation: [coordinate metadata and conversion](../../src/graph/space.ts), [spatial layout](../../src/layout/spatial/layout.ts), [session view controller](../../src/app/viewport/useSpatialView.ts).
