import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { GraphAppearance, GraphLayoutAppearance } from "../../graph/appearance";
import { type GraphAppearancePresetId, GRAPH_APPEARANCE_PRESETS } from "../../graph/appearanceCommands";
import type { GraphChartType, GraphLayoutMode } from "../../graph/types";
import { getGraphChartLabel, GRAPH_TITLE_FONT_OPTIONS } from "../../graph/types";
import AppearancePreview from "./AppearancePreview";
import LayoutSliderControl from "./LayoutSliderControl";
import { APPEARANCE_TOKEN_CONTROLS, LAYOUT_CONTROLS } from "./settingsConfig";
import { clampNumberInput } from "./settingsUtils";

interface AppearanceSettingsProps {
  view?: "chart" | "appearance" | "layout";
  query?: string;
  chartType: GraphChartType;
  sankeyUnavailableReason: string | null;
  onChartTypeChange: (type: GraphChartType) => void;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  appearanceCssDraft: string;
  cssVarDrafts: Record<string, string>;
  titleSizeDraft: string;
  titleFontSize: number;
  onAppearanceCssDraftChange: (value: string) => void;
  onCssVarDraftsChange: Dispatch<SetStateAction<Record<string, string>>>;
  onTitleSizeDraftChange: (value: string) => void;
  onLayoutModeChange: (mode: GraphLayoutMode) => void;
  onLayoutAppearanceChange: <K extends keyof GraphLayoutAppearance>(key: K, value: GraphLayoutAppearance[K]) => void;
  onAppearanceCssVarChange: (key: string, value: string) => void;
  onAppearanceCssChange: (css: string) => void;
  onAppearanceDisplayChange: <K extends keyof GraphAppearance["display"]>(
    key: K,
    value: GraphAppearance["display"][K],
  ) => void;
  onAppearancePresetChange: (presetId: GraphAppearancePresetId) => void;
  onAppearanceReset: () => void;
  onAppearanceExport: () => void;
  onAppearanceImportClick: (event: React.MouseEvent<HTMLInputElement>) => void;
  onAppearanceImportChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onNodeDetailToggle: () => void;
  onNodeBordersToggle: () => void;
  onNodeWidthAlignToggle: () => void;
}

export default function AppearanceSettings(p: AppearanceSettingsProps) {
  const vars = p.appearance.cssVars;
  const titleFamily = vars["--dag-title-font-family"] || GRAPH_TITLE_FONT_OPTIONS[0].value;
  const selectedPreset = GRAPH_APPEARANCE_PRESETS.find(
    (preset) => JSON.stringify(preset.appearance) === JSON.stringify(p.appearance),
  );
  const matches = (keywords: string) =>
    !p.query ||
    p.query
      .toLowerCase()
      .split(/\s+/)
      .every((word) => keywords.toLowerCase().includes(word));
  const isSankey = p.chartType === "sankey";
  const context = (
    <p className="settings-chart-context">
      <strong>{getGraphChartLabel(p.chartType)}</strong>
      <span>{p.view === "layout" ? "Layout settings" : "Independent appearance"}</span>
    </p>
  );

  if (p.view === "chart")
    return (
      <section className="settings-section">
        <p>Choose how to represent your graph. Each type remembers its own appearance.</p>
        <div className="chart-type-grid">
          {(
            [
              ["node-link", "Node-link", "Nodes and connecting lines show relationships."],
              ["sankey", "Sankey", "Band widths show the amount flowing between nodes."],
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
              <svg viewBox="0 0 160 70" aria-hidden="true">
                {value === "node-link" ? (
                  <>
                    <path d="M35 35H72L116 17M72 35L116 53" fill="none" stroke="currentColor" strokeWidth="2" />
                    {[
                      [18, 25],
                      [116, 7],
                      [116, 43],
                    ].map(([x, y]) => (
                      <rect key={y} x={x} y={y} width="28" height="20" rx="5" fill="white" stroke="currentColor" />
                    ))}
                  </>
                ) : (
                  <>
                    <path
                      d="M30 32C76 32 76 22 126 22"
                      stroke="currentColor"
                      strokeWidth="20"
                      opacity=".3"
                      fill="none"
                    />
                    <path
                      d="M30 49C76 49 76 55 126 55"
                      stroke="currentColor"
                      strokeWidth="12"
                      opacity=".5"
                      fill="none"
                    />
                    <g fill="currentColor">
                      <rect x="23" y="22" width="7" height="33" rx="2" />
                      <rect x="126" y="12" width="7" height="20" rx="2" />
                      <rect x="126" y="49" width="7" height="12" rx="2" />
                    </g>
                  </>
                )}
              </svg>
              <strong>{label}</strong>
              <small>{description}</small>
            </button>
          ))}
        </div>
        {p.sankeyUnavailableReason ? (
          <p id="sankey-requirements" className="settings-chart-warning" role="status">
            {p.sankeyUnavailableReason}
          </p>
        ) : (
          <p>Sankey requires non-negative numeric edge values. Cycles are displayed as return flows.</p>
        )}
      </section>
    );

  if (p.view === "layout")
    return (
      <>
        {context}
        {!isSankey && matches("layout engine algorithm level bfs sugiyama dagre layered node link") && (
          <section className="settings-section">
            <h3>Node-link layout</h3>
            <p>Choose how nodes are arranged.</p>
            <div className="layout-engine-grid">
              {(
                [
                  ["sugiyama", "Sugiyama", "Reduce crossings in connected graphs."],
                  ["level", "BFS", "Follow the graph one level at a time."],
                  ["dagre", "Dagre", "Balance complex directed layouts."],
                ] as const
              ).map(([value, label, description]) => (
                <button
                  key={value}
                  className={p.layoutMode === value ? "is-selected" : ""}
                  aria-pressed={p.layoutMode === value}
                  onClick={() => p.onLayoutModeChange(value)}
                >
                  <span className={`layout-mini layout-mini--${value}`} aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                  <strong>{label}</strong>
                  <small>{description}</small>
                </button>
              ))}
            </div>
          </section>
        )}
        {isSankey && matches("layout sankey flow automatic width") && (
          <section className="settings-section">
            <h3>Automatic flow layout</h3>
            <p>
              Nodes follow the flow from left to right. Return flows run below the chart. Node heights and band widths
              share one flow scale.
            </p>
            <div className="settings-slider-grid">
              <DisplaySlider
                label="Flow node width"
                value={p.appearance.display.sankeyNodeWidth}
                min={8}
                max={48}
                unit="px"
                onChange={(value) => p.onAppearanceDisplayChange("sankeyNodeWidth", value)}
              />
            </div>
          </section>
        )}
        {matches("layout spacing layer node line height width tuning") && (
          <section className="settings-section">
            <h3>Spacing & dimensions</h3>
            <p>Fine-tune graph density and label room.</p>
            <div className="settings-slider-grid">
              {LAYOUT_CONTROLS.filter(
                (control) =>
                  !isSankey ||
                  control.key === "rowGap" ||
                  control.key === "maxNodeWidth" ||
                  control.key === "nodeHeight",
              ).map((control) => (
                <LayoutSliderControl
                  key={control.key}
                  control={
                    isSankey
                      ? {
                          ...control,
                          label:
                            control.key === "maxNodeWidth"
                              ? "Label room"
                              : control.key === "nodeHeight"
                                ? "Vertical space per node"
                                : control.label,
                        }
                      : control
                  }
                  value={p.appearance.layout[control.key]}
                  onChange={(value) => p.onLayoutAppearanceChange(control.key, value)}
                />
              ))}
            </div>
          </section>
        )}
      </>
    );

  return (
    <>
      {context}
      {isSankey && matches("appearance sankey flow opacity bands") && (
        <section className="settings-section">
          <h3>Flow bands</h3>
          <p>Colors follow the node and edge colors in your graph.</p>
          <DisplaySlider
            label="Flow opacity"
            value={p.appearance.display.sankeyLinkOpacity}
            min={5}
            max={90}
            unit="%"
            onChange={(value) => p.onAppearanceDisplayChange("sankeyLinkOpacity", value)}
          />
        </section>
      )}
      {!p.query && (
        <AppearancePreview
          appearance={p.appearance}
          chartType={p.chartType}
          hideNodeBorders={p.hideNodeBorders}
          showNodeDetail={p.showNodeDetail}
        />
      )}
      {matches("appearance preset theme simple compact default slate blueprint contrast presentation") && (
        <section className="settings-section">
          <h3>Style presets</h3>
          <p>A starting point for the current chart type. Customize any value below.</p>
          <div className="preset-grid">
            {GRAPH_APPEARANCE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={selectedPreset?.id === preset.id ? "is-selected" : ""}
                aria-pressed={selectedPreset?.id === preset.id}
                onClick={() => p.onAppearancePresetChange(preset.id)}
              >
                <span
                  className="preset-sample"
                  style={{
                    background: preset.appearance.cssVars["--dag-node-fill"],
                    color: preset.appearance.cssVars["--dag-text-strong"],
                    borderColor: preset.appearance.cssVars["--dag-node-border"],
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
        </section>
      )}
      {matches("appearance shadow shadows elevation blur offset opacity depth") && (
        <section className="settings-section">
          <h3>Node shadows</h3>
          <Toggle
            label="Soft shadows"
            description="A drop shadow beneath each node. These controls change the shadow, not the node fill. Dense graphs omit shadows for performance."
            checked={p.appearance.display.nodeShadow}
            onChange={() => p.onAppearanceDisplayChange("nodeShadow", !p.appearance.display.nodeShadow)}
          />
          <div className="settings-slider-grid">
            <DisplaySlider
              label="Shadow softness"
              value={p.appearance.display.shadowBlur}
              min={0}
              max={32}
              unit="px"
              disabled={!p.appearance.display.nodeShadow}
              onChange={(value) => p.onAppearanceDisplayChange("shadowBlur", value)}
            />
            <DisplaySlider
              label="Shadow distance"
              value={p.appearance.display.shadowOffset}
              min={0}
              max={16}
              unit="px"
              disabled={!p.appearance.display.nodeShadow}
              onChange={(value) => p.onAppearanceDisplayChange("shadowOffset", value)}
            />
            <DisplaySlider
              label="Shadow opacity"
              value={p.appearance.display.shadowOpacity}
              min={0}
              max={40}
              unit="%"
              disabled={!p.appearance.display.nodeShadow}
              onChange={(value) => p.onAppearanceDisplayChange("shadowOpacity", value)}
            />
          </div>
        </section>
      )}
      {matches("appearance colors tokens fill border root edge active title soft text") && (
        <section className="settings-section">
          <h3>Colors</h3>
          <div className="color-settings-grid">
            {APPEARANCE_TOKEN_CONTROLS.filter(
              (token) =>
                token.key !== "--dag-title-font-size" &&
                (!isSankey || ["--dag-text-strong", "--dag-text-soft", "--dag-edge-active"].includes(token.key)),
            ).map((token) => (
              <label key={token.key}>
                <span>{token.label}</span>
                <div>
                  <span className="color-swatch" style={{ background: vars[token.key] }} />
                  <input
                    aria-label={token.label}
                    value={p.cssVarDrafts[token.key] ?? vars[token.key] ?? ""}
                    onChange={(event) =>
                      p.onCssVarDraftsChange((current) => ({ ...current, [token.key]: event.target.value }))
                    }
                    onBlur={(event) => p.onAppearanceCssVarChange(token.key, event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") event.currentTarget.blur();
                    }}
                  />
                </div>
              </label>
            ))}
          </div>
        </section>
      )}
      {matches("appearance typography font title size bold italic") && (
        <section className="settings-section">
          <h3>Typography</h3>
          <div className="typography-settings">
            <label>
              Title font
              <select
                aria-label="Title font"
                value={titleFamily}
                onChange={(event) => p.onAppearanceCssVarChange("--dag-title-font-family", event.target.value)}
              >
                {GRAPH_TITLE_FONT_OPTIONS.map((font) => (
                  <option key={font.value} value={font.value}>
                    {font.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Size (px)
              <input
                aria-label="Title font size"
                type="number"
                min="10"
                max="28"
                value={p.titleSizeDraft}
                onChange={(event) => p.onTitleSizeDraftChange(event.target.value)}
                onBlur={() =>
                  p.onAppearanceCssVarChange(
                    "--dag-title-font-size",
                    `${clampNumberInput(p.titleSizeDraft, 10, 28, p.titleFontSize)}px`,
                  )
                }
                onKeyDown={(event) => {
                  if (event.key === "Enter") event.currentTarget.blur();
                }}
              />
            </label>
            <button
              className="studio-button"
              aria-label="Bold title"
              aria-pressed={vars["--dag-title-font-weight"] === "700"}
              onClick={() =>
                p.onAppearanceCssVarChange(
                  "--dag-title-font-weight",
                  vars["--dag-title-font-weight"] === "700" ? "400" : "700",
                )
              }
            >
              <b>B</b>
            </button>
            <button
              className="studio-button"
              aria-label="Italic title"
              aria-pressed={vars["--dag-title-font-style"] === "italic"}
              onClick={() =>
                p.onAppearanceCssVarChange(
                  "--dag-title-font-style",
                  vars["--dag-title-font-style"] === "italic" ? "normal" : "italic",
                )
              }
            >
              <i>I</i>
            </button>
          </div>
        </section>
      )}
      {matches("appearance visibility view details descriptions borders width labels edges") && (
        <section className="settings-section">
          <h3>Visible details</h3>
          {!isSankey && (
            <Toggle
              label="Node descriptions"
              description="Show a short description under each title."
              checked={p.showNodeDetail}
              onChange={p.onNodeDetailToggle}
            />
          )}
          <Toggle
            label="Node borders"
            description="Draw an outline around nodes."
            checked={!p.hideNodeBorders}
            onChange={p.onNodeBordersToggle}
          />
          {!isSankey && (
            <Toggle
              label="Equal node widths"
              description="Align nodes to the widest visible node."
              checked={p.alignNodeWidthsToMax}
              onChange={p.onNodeWidthAlignToggle}
            />
          )}
          <Toggle
            label="Edge labels"
            description="Show the relation value beside each edge."
            checked={p.appearance.display.showEdgeLabels}
            onChange={() => p.onAppearanceDisplayChange("showEdgeLabels", !p.appearance.display.showEdgeLabels)}
          />
        </section>
      )}
      {matches("appearance custom css advanced stylesheet configuration import export reset") && (
        <details className="settings-advanced" open={Boolean(p.query)}>
          <summary>Advanced appearance</summary>
          <section className="settings-section">
            <h3>Custom graph CSS</h3>
            <p>Overrides graph styles, including the exported SVG.</p>
            <textarea
              aria-label="Custom graph CSS"
              className="appearance-css-editor"
              spellCheck={false}
              value={p.appearanceCssDraft}
              rows={10}
              onChange={(event) => p.onAppearanceCssDraftChange(event.target.value)}
            />
            <button
              className="studio-button"
              onClick={() => p.onAppearanceCssChange(p.appearanceCssDraft)}
              disabled={p.appearanceCssDraft === p.appearance.css}
            >
              Apply CSS
            </button>
            <h3>Appearance configuration</h3>
            <div className="settings-inline-actions">
              <label className="studio-button settings-file-input">
                Import configuration
                <input
                  type="file"
                  accept=".json,application/json"
                  aria-label="Import appearance configuration"
                  onClick={p.onAppearanceImportClick}
                  onChange={p.onAppearanceImportChange}
                />
              </label>
              <button className="studio-button" onClick={p.onAppearanceExport}>
                Export configuration
              </button>
              <button className="studio-button subtle-danger" onClick={p.onAppearanceReset}>
                Reset appearance
              </button>
            </div>
          </section>
        </details>
      )}
    </>
  );
}
function Toggle({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: () => void;
}) {
  return (
    <label className="settings-toggle-row">
      <span>
        <strong>{label}</strong>
        <small>{description}</small>
      </span>
      <input type="checkbox" role="switch" checked={checked} onChange={onChange} />
    </label>
  );
}

function DisplaySlider({
  label,
  value,
  min,
  max,
  unit,
  disabled,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  unit: string;
  disabled?: boolean;
  onChange: (value: number) => void;
}) {
  return (
    <label className="display-slider">
      <span>
        {label}
        <output>
          {value}
          {unit}
        </output>
      </span>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}
