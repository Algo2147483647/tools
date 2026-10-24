import { useState } from "react";
import type { useSpatialView } from "../controllers/useSpatialView";
import Icon from "./ui/Icon";
import type { StageData } from "../layout/shared/types";
import { spatialUnitScale } from "../graph/space";

export default function SpatialControls({
  spatial,
  layout,
}: {
  spatial: ReturnType<typeof useSpatialView>;
  layout?: StageData["spatial"];
}) {
  const { metadata, view, change } = spatial;
  const [collapsed, setCollapsed] = useState(false);
  if (!metadata)
    return <aside className="spatial-controls">Spatial · Add metadata.space to define the coordinate system.</aside>;
  const sphere = ["spherical", "geographic"].includes(metadata.coordinateSystem);
  const dimensions =
    metadata.coordinateSystem === "geographic" ? Math.max(3, metadata.dimensions) : metadata.dimensions;
  return (
    <aside className="spatial-controls" data-collapsed={collapsed} aria-label="Spatial view controls">
      <div className="spatial-controls-heading">
        <button
          type="button"
          className="spatial-controls-toggle"
          aria-label={collapsed ? "Expand Spatial controls" : "Collapse Spatial controls"}
          aria-expanded={!collapsed}
          aria-controls="spatial-controls-fields"
          onClick={() => setCollapsed((value) => !value)}
        >
          <strong>Spatial</strong>
          <Icon name="chevron" size={16} style={{ transform: collapsed ? "rotate(180deg)" : undefined }} />
        </button>
        {!collapsed && (
          <span>
            {metadata.dimensions}D · {metadata.coordinateSystem}
            {metadata.unit ? ` · ${metadata.unit}` : ""}
          </span>
        )}
        {!collapsed && (
          <button type="button" onClick={spatial.reset}>
            Reset view
          </button>
        )}
      </div>
      {!collapsed && (
        <div id="spatial-controls-fields" className="spatial-controls-fields">
          {metadata.dimensions > 0 && layout && Number.isFinite(layout.pixelsPerUnit) && layout.pixelsPerUnit > 0 && (
            <DisplayUnits layout={layout} onChange={(unitScale) => change({ unitScale })} />
          )}
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
              <AngleInput
                label="Rotate"
                ariaLabel="Spatial rotation"
                limit={180}
                value={view.yaw}
                onCommit={(yaw) => change({ yaw })}
              />
              <AngleInput
                label="Tilt"
                ariaLabel="Spatial tilt"
                limit={90}
                value={view.pitch}
                onCommit={(pitch) => change({ pitch })}
              />
            </>
          )}
          <label className="spatial-checkbox">
            <input type="checkbox" checked={view.grid} onChange={(e) => change({ grid: e.target.checked })} /> Grid
          </label>
          <label className="spatial-checkbox">
            <input type="checkbox" checked={view.labels} onChange={(e) => change({ labels: e.target.checked })} />{" "}
            Labels
          </label>
          {sphere && (
            <label
              className="spatial-checkbox"
              title={view.projection === "map" ? "Available in 3D projections" : undefined}
            >
              <input
                type="checkbox"
                checked={view.hideBackPoints}
                disabled={view.projection === "map"}
                onChange={(event) => change({ hideBackPoints: event.target.checked })}
              />
              Hide back points
            </label>
          )}
          {layout?.legend && (
            <div className="spatial-legend" aria-label="Point size legend">
              <strong>{layout.legend.title}</strong>
              <div className="spatial-legend-items">
                {layout.legend.items.map((item, index) => (
                  <span key={index}>
                    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden="true">
                      <circle
                        cx="13"
                        cy="13"
                        r={item.radius}
                        fill={item.hollow ? "none" : "currentColor"}
                        stroke={item.hollow ? "currentColor" : undefined}
                        opacity={item.opacity}
                      />
                    </svg>
                    {item.label}
                  </span>
                ))}
              </div>
              <small>{layout.legend.description}</small>
            </div>
          )}
        </div>
      )}
    </aside>
  );
}

function DisplayUnits({
  layout,
  onChange,
}: {
  layout: NonNullable<StageData["spatial"]>;
  onChange(value: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const base = layout.pixelsPerUnit / layout.unitScale;
  const display = String(Number(layout.pixelsPerUnit.toPrecision(6)));
  return (
    <div className="spatial-display-units">
      <label title="Coordinate spacing at 100% zoom. Increase to spread points apart. Zoom still scales labels, points and lines together.">
        Display units
        <span className="spatial-angle-input">
          <input
            aria-label="Pixels per coordinate unit"
            type="number"
            min={base * 0.1}
            max={base * 100}
            step="any"
            value={draft ?? display}
            onChange={(event) => setDraft(event.target.value)}
            onBlur={(event) => {
              const next = event.currentTarget.valueAsNumber;
              if (Number.isFinite(next) && next > 0 && draft !== null) onChange(spatialUnitScale(next / base));
              setDraft(null);
            }}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.currentTarget.value = "";
                setDraft(null);
                event.currentTarget.blur();
              } else if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
              }
            }}
          />
          <span>px / {layout.displayUnit}</span>
        </span>
      </label>
      <button
        type="button"
        aria-label="Halve coordinate spacing"
        disabled={layout.unitScale <= 0.1}
        onClick={() => onChange(spatialUnitScale(layout.unitScale / 2))}
      >
        ÷2
      </button>
      <button
        type="button"
        aria-label="Double coordinate spacing"
        disabled={layout.unitScale >= 100}
        onClick={() => onChange(spatialUnitScale(layout.unitScale * 2))}
      >
        ×2
      </button>
      <button type="button" onClick={() => onChange(1)}>
        Auto
      </button>
      <span className="spatial-units-hint">At 100% zoom · larger values spread points apart</span>
    </div>
  );
}

function AngleInput({
  label,
  ariaLabel,
  limit,
  value,
  onCommit,
}: {
  label: string;
  ariaLabel: string;
  limit: number;
  value: number;
  onCommit(value: number): void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const display = String(value);
  return (
    <label>
      {label}
      <span className="spatial-angle-input">
        <input
          aria-label={ariaLabel}
          type="number"
          min={-limit}
          max={limit}
          step="any"
          value={draft ?? display}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={(event) => {
            const next = event.currentTarget.valueAsNumber;
            if (Number.isFinite(next)) onCommit(Math.max(-limit, Math.min(limit, next)));
            setDraft(null);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              event.currentTarget.value = display;
              event.currentTarget.blur();
            } else if (event.key === "Enter") {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        <span aria-hidden="true">°</span>
      </span>
    </label>
  );
}
