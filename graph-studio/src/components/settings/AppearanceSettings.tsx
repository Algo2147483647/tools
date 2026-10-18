import Icon from "../ui/Icon";
import ChartTypeIcon from "../ui/ChartTypeIcon";
import ChartSchema from "./ChartSchema";
import TimelineControls, { type TimelineControlsProps } from "../TimelineControls";
import type { ChangeEvent } from "react";
import type { GraphAppearance, GraphLayoutAppearance } from "../../graph/appearance";
import { type GraphAppearancePresetId, getGraphAppearancePresets } from "../../graph/appearanceCommands";
import type { GraphChartType, GraphLayoutMode } from "../../graph/types";
import { GRAPH_TITLE_FONT_OPTIONS } from "../../graph/types";
import LayoutSliderControl from "./LayoutSliderControl";
import { getLayoutControls } from "./settingsConfig";
import { useState } from "react";
import { getDefaultChartStyle } from "../../state/chartStyles";
import NumericSetting, { ResetSetting } from "./NumericSetting";
import ColorSetting from "./ColorSetting";
import { APPEARANCE_GROUPS, getSettingsCatalog, matchesSetting, type AppearanceGroup } from "./settingsCatalog";

interface AppearanceSettingsProps {
  view?: "chart" | "appearance" | "layout";
  onSectionReset: (group: AppearanceGroup | "layout") => void;
  onPreviewModeChange: (mode: "overview" | "detail") => void;
  query?: string;
  chartType: GraphChartType;
  sankeyUnavailableReason: string | null;
  onChartTypeChange: (type: GraphChartType) => void;
  timelineControls?: TimelineControlsProps;
  layoutMode: GraphLayoutMode;
  appearance: GraphAppearance;
  showNodeDetail: boolean;
  hideNodeBorders: boolean;
  alignNodeWidthsToMax: boolean;
  appearanceCssDraft: string;
  titleFontSize: number;
  onAppearanceCssDraftChange: (value: string) => void;
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
  const presets = getGraphAppearancePresets(p.chartType);
  const defaultStyle = getDefaultChartStyle(p.chartType);
  const selectedPreset = presets.find(
    (preset) =>
      JSON.stringify(preset.appearance) === JSON.stringify(p.appearance) &&
      (preset.id !== "default" ||
        (p.showNodeDetail === defaultStyle.showNodeDetail &&
          p.hideNodeBorders === defaultStyle.hideNodeBorders &&
          p.alignNodeWidthsToMax === defaultStyle.alignNodeWidthsToMax)),
  );
  const [group, setGroup] = useState<AppearanceGroup>("nodes");
  const catalog = getSettingsCatalog(p.chartType);
  const visible = (id: string) => catalog.some((item) => item.id === id && matchesSetting(item, p.query || ""));
  const isSankey = p.chartType === "sankey";
  const isTimeline = p.chartType === "timeline";
  const defaults = defaultStyle.appearance;
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

  if (p.view === "layout")
    return (
      <>
        {p.chartType === "node-link" && visible("engine") && (
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
        {p.chartType === "compound" && visible("nested") && (
          <section className="settings-section">
            <h3>Nested layout</h3>
            <p>
              ELK arranges nested containers and routes relationships across group boundaries. Expand and collapse
              groups on the canvas.
            </p>
          </section>
        )}
        {isTimeline && p.timelineControls && (
          <TimelineControls
            {...p.timelineControls}
            showArrangement={visible("timeline-arrangement")}
            showAxis={visible("timeline-axis")}
          />
        )}
        {isSankey && visible("sankeyNodeWidth") && (
          <section className="settings-section">
            <h3>Automatic flow layout</h3>
            <p>
              Nodes follow the flow from left to right. Return flows run below the chart. Node heights and band widths
              share one flow scale.
            </p>
            <div className="settings-slider-grid">
              <NumericSetting
                label="Flow node width"
                value={p.appearance.display.sankeyNodeWidth}
                defaultValue={defaults.display.sankeyNodeWidth}
                min={0}
                max={48}
                unit="px"
                onChange={(value) => p.onAppearanceDisplayChange("sankeyNodeWidth", value)}
              />
            </div>
          </section>
        )}
        {getLayoutControls(p.chartType).some((control) => visible(control.key)) && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <h3>Spacing & dimensions</h3>
              <button type="button" className="setting-section-reset" onClick={() => p.onSectionReset("layout")}>
                Reset dimensions
              </button>
            </div>
            <p>Fine-tune graph density and label room.</p>
            <div className="settings-slider-grid">
              {getLayoutControls(p.chartType)
                .filter((control) => visible(control.key))
                .map((control) => (
                  <LayoutSliderControl
                    key={control.key}
                    control={control}
                    defaultValue={defaults.layout[control.key]}
                    value={p.appearance.layout[control.key]}
                    onChange={(value) => p.onLayoutAppearanceChange(control.key, value)}
                  />
                ))}
            </div>
          </section>
        )}
      </>
    );

  const sliders = [
    ["nodeCornerRadius", 0, 80, "px"],
    ["shadowBlur", 0, 32, "px"],
    ["shadowOffset", 0, 16, "px"],
    ["shadowOpacity", 0, 40, "%"],
    ["sankeyLinkOpacity", 0, 90, "%"],
  ] as const;
  const toggle = (id: "showNodeDots" | "nodeShadow" | "showGroupStats" | "showGroupBorders" | "showEdgeLabels") => (
    <Toggle
      key={id}
      label={catalog.find((item) => item.id === id)!.label}
      checked={p.appearance.display[id]}
      defaultValue={defaults.display[id]}
      onChange={() => p.onAppearanceDisplayChange(id, !p.appearance.display[id])}
      onReset={() => p.onAppearanceDisplayChange(id, defaults.display[id])}
    />
  );
  const renderGroup = (id: AppearanceGroup, label: string) => {
    const items = catalog.filter((item) => item.chapter === "appearance" && item.group === label && visible(item.id));
    if (!items.length) return null;
    const has = (key: string) => items.some((item) => item.id === key);
    const slider = ([key, min, max, unit]: (typeof sliders)[number]) => (
      <NumericSetting
        key={key}
        label={catalog.find((item) => item.id === key)!.label}
        value={p.appearance.display[key]}
        defaultValue={defaults.display[key]}
        min={min}
        max={max}
        unit={unit}
        disabled={key.startsWith("shadow") && !p.appearance.display.nodeShadow}
        onChange={(value) => p.onAppearanceDisplayChange(key, value)}
      />
    );
    return (
      <section className="settings-section appearance-group" key={id} aria-label={`${label} settings`}>
        {has("presets") && (
          <>
            <p>{selectedPreset ? `${selectedPreset.label} preset` : "Custom style"} · Choose a starting point.</p>
            <div className="preset-grid">
              {presets.map((preset) => (
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
          </>
        )}
        {sliders.filter(([key]) => has(key) && key === "nodeCornerRadius").map(slider)}
        {items
          .filter((item) => item.id.startsWith("--dag-"))
          .map((item) => (
            <ColorSetting
              key={item.id}
              label={item.label}
              value={vars[item.id] || defaults.cssVars[item.id]}
              defaultValue={defaults.cssVars[item.id]}
              onChange={(value) => p.onAppearanceCssVarChange(item.id, value)}
            />
          ))}
        {has("nodeShadow") && toggle("nodeShadow")}
        {sliders.filter(([key]) => has(key) && key !== "nodeCornerRadius").map(slider)}
        {has("showNodeDots") && toggle("showNodeDots")}
        {has("showGroupStats") && toggle("showGroupStats")}
        {has("showGroupBorders") && toggle("showGroupBorders")}
        {has("showEdgeLabels") && toggle("showEdgeLabels")}
        {has("hideNodeBorders") && (
          <Toggle
            label="Node borders"
            checked={!p.hideNodeBorders}
            defaultValue={!defaultStyle.hideNodeBorders}
            onChange={p.onNodeBordersToggle}
            onReset={() => {
              if (p.hideNodeBorders !== defaultStyle.hideNodeBorders) p.onNodeBordersToggle();
            }}
          />
        )}
        {has("showNodeDetail") && (
          <Toggle
            label="Node descriptions"
            checked={p.showNodeDetail}
            defaultValue={defaultStyle.showNodeDetail}
            onChange={p.onNodeDetailToggle}
            onReset={() => {
              if (p.showNodeDetail !== defaultStyle.showNodeDetail) p.onNodeDetailToggle();
            }}
          />
        )}
        {has("alignNodeWidthsToMax") && (
          <Toggle
            label="Equal node widths"
            checked={p.alignNodeWidthsToMax}
            defaultValue={defaultStyle.alignNodeWidthsToMax}
            onChange={p.onNodeWidthAlignToggle}
            onReset={() => {
              if (p.alignNodeWidthsToMax !== defaultStyle.alignNodeWidthsToMax) p.onNodeWidthAlignToggle();
            }}
          />
        )}
        {(has("titleAlign") || has("titleOverflow") || has("fontWeight") || has("fontStyle")) && (
          <div className="title-format-controls" role="group" aria-label="Title formatting">
            {has("titleAlign") && (
              <div className="title-format-row">
                <span id="title-alignment-label">Alignment</span>
                <div className="title-format-segments" role="group" aria-labelledby="title-alignment-label">
                  {(["left", "center"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      title={value === "left" ? "Align left" : "Align center"}
                      aria-label={value === "left" ? "Align title left" : "Align title center"}
                      aria-pressed={p.appearance.display.titleAlign === value}
                      onClick={() => p.onAppearanceDisplayChange("titleAlign", value)}
                    >
                      <Icon name={value === "left" ? "align-left" : "align-center"} size={18} />
                    </button>
                  ))}
                </div>
                <ResetSetting
                  label="Title alignment"
                  changed={p.appearance.display.titleAlign !== defaults.display.titleAlign}
                  onReset={() => p.onAppearanceDisplayChange("titleAlign", defaults.display.titleAlign)}
                />
              </div>
            )}
            {has("titleOverflow") && (
              <div className="title-format-row">
                <span id="title-overflow-label">Overflow</span>
                <div className="title-format-segments" role="group" aria-labelledby="title-overflow-label">
                  {(
                    [
                      { value: "ellipsis", label: "Ellipsis", icon: "text-ellipsis" },
                      { value: "clip", label: "Clip text", icon: "text-clip" },
                      { value: "visible", label: "Show full title", icon: "text-overflow" },
                    ] as const
                  ).map(({ value, label, icon }) => (
                    <button
                      key={value}
                      type="button"
                      title={label}
                      aria-label={label}
                      aria-pressed={p.appearance.display.titleOverflow === value}
                      onClick={() => p.onAppearanceDisplayChange("titleOverflow", value)}
                    >
                      <Icon name={icon} size={18} />
                    </button>
                  ))}
                </div>
                <ResetSetting
                  label="Title overflow"
                  changed={p.appearance.display.titleOverflow !== defaults.display.titleOverflow}
                  onReset={() => p.onAppearanceDisplayChange("titleOverflow", defaults.display.titleOverflow)}
                />
              </div>
            )}
            {(has("fontWeight") || has("fontStyle")) && (
              <div className="title-format-row">
                <span id="title-style-label">Style</span>
                <div className="title-format-segments" role="group" aria-labelledby="title-style-label">
                  {has("fontWeight") && (
                    <button
                      type="button"
                      title="Bold"
                      aria-label="Bold title"
                      aria-pressed={vars["--dag-title-font-weight"] === "700"}
                      onClick={() =>
                        p.onAppearanceCssVarChange(
                          "--dag-title-font-weight",
                          vars["--dag-title-font-weight"] === "700"
                            ? defaults.cssVars["--dag-title-font-weight"] === "700"
                              ? "400"
                              : defaults.cssVars["--dag-title-font-weight"]
                            : "700",
                        )
                      }
                    >
                      <Icon name="bold" size={18} />
                    </button>
                  )}
                  {has("fontStyle") && (
                    <button
                      type="button"
                      title="Italic"
                      aria-label="Italic title"
                      aria-pressed={vars["--dag-title-font-style"] === "italic"}
                      onClick={() =>
                        p.onAppearanceCssVarChange(
                          "--dag-title-font-style",
                          vars["--dag-title-font-style"] === "italic" ? "normal" : "italic",
                        )
                      }
                    >
                      <Icon name="italic" size={18} />
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
        {has("titleWrap") && (
          <Toggle
            label="Two-line title"
            checked={p.appearance.display.titleWrap}
            defaultValue={defaults.display.titleWrap}
            onChange={() => p.onAppearanceDisplayChange("titleWrap", !p.appearance.display.titleWrap)}
            onReset={() => p.onAppearanceDisplayChange("titleWrap", defaults.display.titleWrap)}
          />
        )}
        {has("fontFamily") && (
          <div className="font-setting">
            <div className="setting-label-row">
              <label htmlFor="setting-title-font">Title font</label>
              <ResetSetting
                label="Title font"
                changed={titleFamily !== defaults.cssVars["--dag-title-font-family"]}
                onReset={() =>
                  p.onAppearanceCssVarChange("--dag-title-font-family", defaults.cssVars["--dag-title-font-family"])
                }
              />
            </div>
            <select
              id="setting-title-font"
              value={titleFamily}
              onChange={(event) => p.onAppearanceCssVarChange("--dag-title-font-family", event.target.value)}
            >
              {GRAPH_TITLE_FONT_OPTIONS.map((font) => (
                <option key={font.label} value={font.value}>
                  {font.label}
                </option>
              ))}
            </select>
          </div>
        )}
        {has("fontSize") && (
          <NumericSetting
            label="Title size"
            value={p.titleFontSize}
            defaultValue={parseInt(defaults.cssVars["--dag-title-font-size"], 10)}
            min={0}
            max={28}
            onChange={(value) => p.onAppearanceCssVarChange("--dag-title-font-size", `${value}px`)}
          />
        )}
        {has("css") && (
          <div className="settings-css">
            <label htmlFor="setting-css">Custom graph CSS</label>
            <p>Applies to the graph and SVG export.</p>
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
        {["nodes", "edges", "text"].includes(id) && (
          <div className="appearance-group-actions">
            <button type="button" className="setting-section-reset" onClick={() => p.onSectionReset(id)}>
              Reset {label.toLowerCase()} style
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
              onClick={() => {
                setGroup(item.id);
                p.onPreviewModeChange(item.id === "nodes" || item.id === "text" ? "detail" : "overview");
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

function Toggle({
  label,
  checked,
  defaultValue,
  onChange,
  onReset,
}: {
  label: string;
  checked: boolean;
  defaultValue: boolean;
  onChange: () => void;
  onReset: () => void;
}) {
  return (
    <div className="setting-toggle">
      <label className="settings-toggle-row">
        <span>
          {label}
          {checked !== defaultValue && <span className="setting-modified" aria-label="Modified from default" />}
        </span>
        <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={onChange} />
      </label>
      <ResetSetting label={label} changed={checked !== defaultValue} onReset={onReset} />
    </div>
  );
}
