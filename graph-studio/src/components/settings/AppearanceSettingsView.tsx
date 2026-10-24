import type { ChangeEvent } from "react";
import { useState } from "react";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { GraphChartType } from "../../graph/types";
import { getGraphAppearancePresets, type GraphAppearancePresetId } from "../../schema/appearance/commands";
import { chartStylesEqual, type ChartStyle } from "../../schema/appearance/styles";
import { type TimelineControlsProps } from "../timeline/TimelineControls";
import ChartTypeIcon from "../ui/ChartTypeIcon";
import AppearanceSchema from "./AppearanceSchema";
import { AppearanceUIOutlet } from "./AppearanceUIContext";
import ChartSchema from "./ChartSchema";
import { APPEARANCE_UI } from "./appearanceUIConfig";
import { APPEARANCE_GROUPS, getSettingsCatalog, matchesSetting, type AppearanceGroup } from "./settingsCatalog";

export interface AppearanceSettingsProps {
  view?: "chart" | "appearance";
  onSectionReset: (group: AppearanceGroup | "layout") => void;
  onPreviewModeChange: (mode: "overview" | "detail") => void;
  query?: string;
  chartType: GraphChartType;
  sankeyUnavailableReason: string | null;
  onChartTypeChange: (type: GraphChartType) => void;
  timelineControls?: TimelineControlsProps;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  appearanceCssDraft: string;
  onAppearanceCssDraftChange: (value: string) => void;
  onAppearanceCssChange: (css: string) => void;
  onAppearancePresetChange: (presetId: GraphAppearancePresetId) => void;
  onAppearanceSchemaChange: (style: ChartStyle) => void;
  onAppearanceReset: () => void;
  onAppearanceExport: () => void;
  onAppearanceImportClick: (event: React.MouseEvent<HTMLInputElement>) => void;
  onAppearanceImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
}

export default function AppearanceSettingsView(p: AppearanceSettingsProps) {
  const presets = getGraphAppearancePresets(p.chartType);
  const selectedPreset = presets.find((preset) =>
    chartStylesEqual(preset.document.style, {
      appearance: p.appearance,
      showNodeDetail: p.showNodeDetail,
      hideNodeBorders: p.hideNodeBorders,
      alignNodeWidthsToMax: p.alignNodeWidthsToMax,
      ...(p.chartType === "timeline" ? { timeline: p.timelineControls?.settings } : {}),
    }),
  );
  const [group, setGroup] = useState<AppearanceGroup>("nodes");
  const catalog = getSettingsCatalog(p.chartType);
  const visible = (id: string) =>
    catalog.some((item) => (item.id === id || item.uiId === id) && matchesSetting(item, p.query || ""));
  const isTimeline = p.chartType === "timeline";
  if (p.view === "chart")
    return (
      <section className="settings-section">
        <div className="chart-type-grid">
          {(
            [
              ["node-link", "Node-link", "Nodes and connecting lines show relationships."],
              ["sankey", "Sankey", "Band widths show the amount flowing between nodes."],
              ["compound", "Nested node-link", "Group nodes into subgraphs, then expand, collapse and explore."],
              [
                "timeline",
                "Timeline",
                "Position events and durations on a real time axis with branching relationships.",
              ],
              ["spatial", "Spatial", "Explore coordinates in 0D, 1D, 2D, 3D and higher dimensions."],
            ] as const
          ).map(([value, label, description]) => (
            <button
              key={value}
              aria-pressed={p.chartType === value}
              className={p.chartType === value ? "is-selected" : ""}
              disabled={value === "sankey" && Boolean(p.sankeyUnavailableReason)}
              aria-describedby={value === "sankey" && p.sankeyUnavailableReason ? "sankey-requirements" : undefined}
              onClick={() => p.onChartTypeChange(value)}
            >
              <ChartTypeIcon type={value} />
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        {p.sankeyUnavailableReason ? (
          <p id="sankey-requirements" className="settings-chart-warning" role="status">
            {p.sankeyUnavailableReason}
          </p>
        ) : null}
        <ChartSchema key={p.chartType} chartType={p.chartType} />
      </section>
    );

  const renderGroup = (id: AppearanceGroup, label: string) => {
    const items = catalog.filter((item) => item.chapter === "appearance" && item.group === label && visible(item.id));
    if (!items.length && !APPEARANCE_UI[id]) return null;
    if (id === "schema")
      return (
        <AppearanceSchema
          key={p.chartType}
          chartType={p.chartType}
          style={{
            appearance: p.appearance,
            showNodeDetail: p.showNodeDetail,
            hideNodeBorders: p.hideNodeBorders,
            alignNodeWidthsToMax: p.alignNodeWidthsToMax,
            ...(isTimeline ? { timeline: p.timelineControls?.settings } : {}),
          }}
          onChange={p.onAppearanceSchemaChange}
          onPresetChange={p.onAppearancePresetChange}
        />
      );
    const has = (key: string) => items.some((item) => item.id === key || item.uiId === key);
    return (
      <section className="settings-section appearance-group" key={id} aria-label={`${label} settings`}>
        {id === "canvas" && <h3>Canvas</h3>}
        {APPEARANCE_UI[id] && <AppearanceUIOutlet node={APPEARANCE_UI[id]} />}
        {has("presets") && (
          <>
            <div className="preset-grid">
              {presets.map((preset) => (
                <button
                  key={preset.id}
                  aria-label={preset.label}
                  className={selectedPreset?.id === preset.id ? "is-selected" : ""}
                  aria-pressed={selectedPreset?.id === preset.id}
                  onClick={() => p.onAppearancePresetChange(preset.id)}
                >
                  <span
                    className="preset-sample"
                    aria-hidden="true"
                    style={{
                      background: preset.document.style.appearance.cssVars["--dag-node-fill"],
                      color: preset.document.style.appearance.cssVars["--dag-text-strong"],
                      borderColor: preset.document.style.appearance.cssVars["--dag-node-border"],
                      fontFamily: preset.document.style.appearance.cssVars["--dag-title-font-family"],
                      fontStyle: preset.document.style.appearance.cssVars["--dag-title-font-style"],
                    }}
                  >
                    <i />
                    Aa<span>→</span>
                    <i />
                  </span>
                  <strong>{preset.label}</strong>
                </button>
              ))}
            </div>
          </>
        )}
        {(has("css") || has("style.appearance.css")) && (
          <div className="settings-css">
            <label htmlFor="setting-css">Custom graph CSS</label>
            <textarea
              id="setting-css"
              spellCheck={false}
              value={p.appearanceCssDraft}
              rows={10}
              onChange={(event) => p.onAppearanceCssDraftChange(event.target.value)}
            />
            <div className="settings-inline-actions">
              <button
                className="studio-button"
                disabled={p.appearanceCssDraft === p.appearance.css}
                onClick={() => p.onAppearanceCssChange(p.appearanceCssDraft)}
              >
                Apply CSS
              </button>
              {p.appearanceCssDraft !== p.appearance.css && <span className="setting-draft">Unapplied changes</span>}
            </div>
          </div>
        )}
        {["nodes", "edges", "canvas"].includes(id) && (
          <div className="appearance-group-actions">
            <button type="button" className="setting-section-reset" onClick={() => p.onSectionReset(id)}>
              {`Reset ${label.toLowerCase()} style`}
            </button>
          </div>
        )}
        {has("configuration") && (
          <div className="settings-inline-actions">
            <label className="studio-button settings-file-input">
              Import style
              <input
                type="file"
                accept=".json,application/json"
                aria-label="Import appearance configuration"
                onClick={p.onAppearanceImportClick}
                onChange={p.onAppearanceImportChange}
              />
            </label>
            <button className="studio-button" onClick={p.onAppearanceExport}>
              Export style
            </button>
            <button className="studio-button subtle-danger" onClick={p.onAppearanceReset}>
              Reset current style
            </button>
          </div>
        )}
      </section>
    );
  };
  return (
    <>
      {!p.query && (
        <nav className="appearance-tabs" aria-label="Appearance groups">
          {APPEARANCE_GROUPS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={group === item.id}
              onClick={(event) => {
                setGroup(item.id);
                event.currentTarget.closest(".settings-page")?.scrollTo({ top: 0 });
                p.onPreviewModeChange(item.id === "nodes" ? "detail" : "overview");
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
      )}
      {APPEARANCE_GROUPS.filter((item) => p.query || item.id === group).map((item) => renderGroup(item.id, item.label))}
    </>
  );
}
