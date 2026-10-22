# Spatial chart

Spatial is the fifth Chart type. Open **Spatial Atlas** from the example gallery, or select **Settings → Chart type → Spatial**. A document containing `metadata.space` opens in Spatial automatically.

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
    "a": { "title": "Origin", "type": "Reference", "space": [0, 0, 0] },
    "b": { "title": "Point", "type": "Sample", "space": [1.0, 2.0, 3.0] }
  },
  "edges": [{ "id": "ab", "source": "a", "target": "b" }]
}
```

## Data contract

`metadata.space.dimensions` is a non-negative safe integer, with no fixed 4D limit. A positioned node has exactly that many finite numbers in `space`. Missing coordinates remain editable in a separate unpositioned tray. Invalid dimensions, non-finite numbers and wrong array lengths are rejected with field paths. The JSON Schema describes both field types; cross-field coordinate count and angular bounds are checked by the importer and edit commands.

| coordinateSystem | Coordinates | Minimum dimensions |
| --- | --- | --- |
| `cartesian` | `[x, y, z, …]` — orthogonal axes | 0 |
| `polar` | `[radius, azimuth, …]` | 2 |
| `spherical` | `[radius, azimuth, elevation, …]` | 3 |
| `cylindrical` | `[radius, azimuth, height, …]` | 3 |
| `geographic` | `[longitude, latitude, altitude?, …]` | 2 |

Angles default to degrees; `angleUnit: "radians"` changes all angular inputs. Spherical elevation is measured from the XY plane, positive toward +Z; it is **not** the colatitude convention. Elevation/latitude is in −90°…90° (−π/2…π/2). Radii are non-negative. Geographic coordinates use a sphere with `radius: 6371` by default, with altitude in kilometers. A custom radius and altitude must use the same linear unit. This is a spherical visualization, not an ellipsoidal geodesy engine.

`axes` optionally supplies one label per input dimension, and `unit` supplies a display label. These fields describe data. Camera rotation, grid and label visibility are session view controls and do not rewrite source coordinates. Source coordinates, metadata and Type survive JSON save/export and undo/redo of node edits. Legacy Timeline `space: 1` remains the one-based row/column index; a spatial document uses arrays instead.

## Viewing and editing

- **Display units** in the Spatial panel sets pixels per coordinate unit at 100% zoom. Increase the value (or use **×2**) to spread points apart without changing source coordinates, label size, point radii or line widths. **÷2** reduces spacing and **Auto** restores automatic spacing. Ordinary zoom still enlarges positions, labels, points and lines together. The current coordinate at the viewport center is preserved when changing display units. Values are limited to 0.1–100 times automatic spacing; this is a session view setting. **Reset view** also restores automatic spacing. Flat degree maps report pixels per degree, not a ground-distance scale; globe projections use converted radial units and perspective additionally depends on depth.
- Globe projections use an outside view with a right-handed camera basis: screen right/up/depth correspond to world Y/Z/X. At Rotate = Tilt = 0, the zero meridian faces the camera, positive azimuth/east is to the right and positive elevation/north is up. Rotate = −90° centers the +90° meridian. The 2D map keeps east to the right and north up.
- In 3D, drag with the left mouse button or one finger to rotate. Right-drag, middle-drag or Shift-drag pans. In a map or 0D–2D view, a normal drag pans. Gestures work across the full canvas, including over points.
- Use the mouse wheel to zoom around the pointer without holding a modifier. On a touchscreen, pinch with two fingers to zoom and move both fingers to pan. The view can pan freely even at the fitted size. A tap selects a point; double-tap or double-click opens its details. Dragging does not select or open a point accidentally.
- The translucent Spatial panel collapses to its heading. Rotate/Tilt accept exact degree values, including decimals; Enter or leaving the field applies the value. The existing zoom controls remain available. **Reset view** resets both orientation and the pan/zoom camera. Rotation preserves the current zoom and pan.
- Spherical/geographic documents also offer a complete equirectangular map. Edges crossing the ±180° seam split at the boundary instead of crossing the map. Globe views show dimmer rear points by default. Enable **Hide back points** in the Spatial panel to hide points facing away from the camera, their labels and incident edges. Visibility updates during rotation and respects the perspective horizon; unpositioned nodes remain in their tray. The option is a session view setting, does not modify data, and is inactive in map projection. The coordinate grid remains a wireframe. Edges are straight chords, not surface geodesics.
- Above 3D, select any three Cartesian dimensions as View X/Y/Z. Non-Cartesian coordinate prefixes are converted first; dimensions beyond the prefix remain available. Other coordinates remain in node data. Two points can overlap if their selected coordinates coincide; choosing another axis exposes the difference. This is explicit axis projection, not PCA or an invented spatial embedding.
- 0D uses `[]`. All points represent the same location; an index tray separates them for selection and explicitly carries no spatial distance meaning. 1D places points on one measured line. All other Cartesian plots preserve aspect ratio.
- Type uses the ordinary `type` field for colors and filtering. Colors and coordinate scale are derived from the full document and stay stable when filtered. Filtering preserves only original edges between visible endpoints.
- Click to focus and highlight neighbors. Double-click (or press Enter on a focused point) to inspect/edit the coordinate array and other fields. Edits validate before committing and support undo/redo. New nodes start at zero coordinates.
- SVG export captures the current projection. HTML export preserves the existing pan/zoom/details viewer around that snapshot; camera rotation controls are available in Graph Studio itself.

## Bundled examples

**Spatial Atlas** contains four graph documents:

- All-sky: 5,044 catalog stars to magnitude 6 plus three constellation-line endpoints; 743 constellation segments. Type identifies 88 constellation regions. Positions are J2000 sky directions on a unit sphere, not measured stellar distances.
- World cities: 8,097 cities across 245 countries/territories, including every 3,708 national/first-order capital record from the GeoNames snapshot without a population cutoff. Spherical `[6371, longitude, latitude]`, local-language titles, continent Types, and 2020 urban-centre GDP (PPP) encoded as logarithmic point area/intensity. Missing GDP stays visible as a hollow point. See the atlas SOURCES.md for matching, coverage and name fallbacks.
- Beijing metro: the 2026-10-22 service snapshot, with 28 through-service routes (30 named lines), 423 stations at sourced WGS84 longitude/latitude points, 515 rail segments and 106 shared interchange nodes. Includes both airport lines, S1, Xijiao and Yizhuang T1. Type filters complete lines and their own edges; station coordinates are never jittered or compressed. Flat maps fit their actual point and label bounds. See the source notes for coordinate provenance and closures.
- Shanghai metro: the 2026-10-22 snapshot of Lines 1–18, Pujiang, Maglev and Airport Link (21 lines, 24 branch paths), with 418 sourced WGS84 station points, 512 rail segments and 90 shared interchange nodes. Keeps the Line 4 ring, Lines 5/10/11 branches and separate same-named sites at National Exhibition and Convention Center and Pudong South Road. Uses the same Display units controls and line filtering as Beijing. The six synthetic 0D–5D example files have been removed; dimensional chart support remains available.

See [example source notes](../public/examples/spatial-atlas/SOURCES.md). Rebuild data with `python scripts/build-spatial-examples.py`; downloads are cached in `.spatial-data/` and are unnecessary at runtime.

Spatial data may supply `spatialStyle` on nodes (`color`: six-digit hex, `radius`: 1–12, `label`: request labels on dense maps) and `metadata.spatialStyle` on edges (`color`, `width`: 0.5–8, `dashed`, `directed`). These affect only Spatial rendering; labels still respect the Labels toggle and overlap suppression. Defaults are unchanged when these optional fields are absent.

For shared station nodes, `metadata.space.typeField: "lines"` reads each node’s category memberships from `lines: string[]`; `edgeTypeField: "line"` filters edges by `metadata.line`. This prevents another service between the same pair of interchange stations from leaking into a line filter. Without these fields, ordinary single-Type behavior is preserved.

Point styles also accept `opacity` (0.1–1), `hollow` (boolean), and finite `labelPriority` (higher values keep labels first). Optional `metadata.spatialLegend` contains a `title`, `description`, and `items` with `label`, `radius`, `opacity`, and `hollow`; it appears inside the collapsible Spatial workbench. Labels prefer larger points when they overlap.
