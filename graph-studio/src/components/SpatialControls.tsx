import type { useSpatialView } from "../controllers/useSpatialView";

export default function SpatialControls({ spatial }: { spatial: ReturnType<typeof useSpatialView> }) {
  const { metadata, view, change } = spatial;
  if (!metadata)
    return <aside className="spatial-controls">Spatial · Add metadata.space to define the coordinate system.</aside>;
  const sphere = ["spherical", "geographic"].includes(metadata.coordinateSystem);
  const dimensions =
    metadata.coordinateSystem === "geographic" ? Math.max(3, metadata.dimensions) : metadata.dimensions;
  return (
    <aside className="spatial-controls" aria-label="Spatial view controls">
      <div className="spatial-controls-heading">
        <strong>Spatial</strong>
        <span>
          {metadata.dimensions}D · {metadata.coordinateSystem}
          {metadata.unit ? ` · ${metadata.unit}` : ""}
        </span>
        <button type="button" onClick={spatial.reset}>
          Reset view
        </button>
      </div>
      <div className="spatial-controls-fields">
        {dimensions >= 3 && (
          <label>
            Projection
            <select
              aria-label="Spatial projection"
              value={view.projection}
              onChange={(e) => change({ projection: e.target.value as typeof view.projection })}
            >
              {sphere && <option value="map">All-sky / world map</option>}
              <option value="orthographic">Orthographic 3D</option>
              <option value="perspective">Perspective 3D</option>
            </select>
          </label>
        )}
        {dimensions > 3 &&
          view.projection !== "map" &&
          view.axes.map((axis, slot) => (
            <label key={slot}>
              View {"XYZ"[slot]}
              <select
                aria-label={`Project dimension ${"XYZ"[slot]}`}
                value={axis}
                onChange={(e) => {
                  const axes = [...view.axes] as typeof view.axes;
                  const next = Number(e.target.value),
                    other = axes.indexOf(next);
                  if (other >= 0) axes[other] = axes[slot];
                  axes[slot] = next;
                  change({ axes });
                }}
              >
                {Array.from({ length: dimensions }, (_, i) => (
                  <option key={i} value={i}>
                    {metadata.coordinateSystem === "cartesian"
                      ? (metadata.axes?.[i] ?? `x${i + 1}`)
                      : i < 3
                        ? ["X", "Y", "Z"][i]
                        : (metadata.axes?.[i] ?? `x${i + 1}`)}
                  </option>
                ))}
              </select>
            </label>
          ))}
        {dimensions >= 3 && view.projection !== "map" && (
          <>
            <label>
              Rotate{" "}
              <input
                aria-label="Spatial rotation"
                type="range"
                min="-180"
                max="180"
                value={view.yaw}
                onChange={(e) => change({ yaw: Number(e.target.value) })}
              />
            </label>
            <label>
              Tilt{" "}
              <input
                aria-label="Spatial tilt"
                type="range"
                min="-90"
                max="90"
                value={view.pitch}
                onChange={(e) => change({ pitch: Number(e.target.value) })}
              />
            </label>
          </>
        )}
        <label className="spatial-checkbox">
          <input type="checkbox" checked={view.grid} onChange={(e) => change({ grid: e.target.checked })} /> Grid
        </label>
        <label className="spatial-checkbox">
          <input type="checkbox" checked={view.labels} onChange={(e) => change({ labels: e.target.checked })} /> Labels
        </label>
      </div>
      <small>
        Drag to pan · Scroll to zoom{dimensions >= 3 && view.projection !== "map" ? " · Shift-drag to orbit" : ""} ·
        Double-click a point to edit
      </small>
    </aside>
  );
}
