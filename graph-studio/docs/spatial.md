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

- Drag the background to pan; scroll or use the existing zoom and fit controls.
- For 3D, choose Orthographic or Perspective, then Shift-drag to orbit or use Rotate/Tilt. The camera and scale remain stable during rotation.
- Spherical/geographic documents also offer a complete equirectangular map. Edges crossing the ±180° seam split at the boundary instead of crossing the map. Globe views are transparent wireframes; rear points remain visible and are dimmer. Edges are straight chords, not surface geodesics.
- Above 3D, select any three Cartesian dimensions as View X/Y/Z. Non-Cartesian coordinate prefixes are converted first; dimensions beyond the prefix remain available. Other coordinates remain in node data. Two points can overlap if their selected coordinates coincide; choosing another axis exposes the difference. This is explicit axis projection, not PCA or an invented spatial embedding.
- 0D uses `[]`. All points represent the same location; an index tray separates them for selection and explicitly carries no spatial distance meaning. 1D places points on one measured line. All other Cartesian plots preserve aspect ratio.
- Type uses the ordinary `type` field for colors and filtering. Colors and coordinate scale are derived from the full document and stay stable when filtered. Filtering preserves only original edges between visible endpoints.
- Click to focus and highlight neighbors. Double-click (or press Enter on a focused point) to inspect/edit the coordinate array and other fields. Edits validate before committing and support undo/redo. New nodes start at zero coordinates.
- SVG export captures the current projection. HTML export preserves the existing pan/zoom/details viewer around that snapshot; camera rotation controls are available in Graph Studio itself.

## Bundled examples

**Spatial Atlas** contains nine graph documents, including:

- All-sky: 5,044 catalog stars to magnitude 6 plus three constellation-line endpoints; 743 constellation segments. Type identifies 88 constellation regions. Positions are J2000 sky directions on a unit sphere, not measured stellar distances.
- World cities: 243 Natural Earth reference cities with local-language titles and spherical `[6371, longitude, latitude]`, Type by continent, with 319 explicitly illustrative nearby-city links. These are not flight routes.
- Beijing roads: 3,841 published junctions and 4,112 directed endpoint pairs from named ring roads and selected arterials in a historical simplified research network. Type uses four geometric city sectors. See the workspace source notes for scope and coordinate limitations.
- 0D points, a 1D line, a polar circle, a cylindrical helix, a 4D tesseract and 5D basis vectors.

See [example source notes](../public/examples/spatial-atlas/SOURCES.md). Rebuild data with `python scripts/build-spatial-examples.py`; downloads are cached in `.spatial-data/` and are unnecessary at runtime.
