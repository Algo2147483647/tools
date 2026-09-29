import type { ChangeEvent, Dispatch, SetStateAction } from "react";
import type { GraphAppearance, GraphLayoutAppearance } from "../../graph/appearance";
import { GRAPH_APPEARANCE_PRESETS, type GraphAppearancePresetId } from "../../graph/appearanceCommands";
import type { GraphLayoutMode } from "../../graph/types";
import { GRAPH_TITLE_FONT_OPTIONS } from "../../graph/types";
import LayoutSliderControl from "./LayoutSliderControl";
import { APPEARANCE_TOKEN_CONTROLS, LAYOUT_CONTROLS } from "./settingsConfig";
import { clampNumberInput } from "./settingsUtils";

interface AppearanceSettingsProps {
  view?: "appearance" | "layout";
  query?: string;
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
  onAppearanceDisplayChange: <K extends keyof GraphAppearance["display"]>(key: K, value: GraphAppearance["display"][K]) => void;
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
  const selectedPreset = GRAPH_APPEARANCE_PRESETS.find(preset => JSON.stringify(preset.appearance) === JSON.stringify(p.appearance));
  const matches = (keywords: string) => !p.query || p.query.toLowerCase().split(/\s+/).every(word => keywords.toLowerCase().includes(word));

  if (p.view === "layout") return <>
    {matches("layout engine algorithm level bfs sugiyama dagre layered") && <section className="settings-section"><h3>Layout engine</h3><p>Choose how nodes are arranged. Your graph data stays unchanged.</p><div className="layout-engine-grid">
      {([
        ["sugiyama","Layered","Reduce crossings in connected graphs."],
        ["level","Level","Follow the graph one level at a time."],
        ["dagre","Dagre","Balance complex directed layouts."],
      ] as const).map(([value,label,description])=><button key={value} className={p.layoutMode===value?"is-selected":""} aria-pressed={p.layoutMode===value} onClick={()=>p.onLayoutModeChange(value)}><span className={`layout-mini layout-mini--${value}`} aria-hidden="true"><i/><i/><i/><i/></span><strong>{label}</strong><small>{description}</small></button>)}
    </div></section>}
    {matches("layout spacing layer node line height width tuning") && <section className="settings-section"><h3>Spacing & dimensions</h3><p>Fine-tune graph density and label room.</p><div className="settings-slider-grid">{LAYOUT_CONTROLS.map(control=><LayoutSliderControl key={control.key} control={control} value={p.appearance.layout[control.key]} onChange={value=>p.onLayoutAppearanceChange(control.key,value)}/>)}</div></section>}
  </>;

  return <>
    {!p.query && <section className="settings-preview-card"><div><span className="eyebrow">LIVE PREVIEW</span><small>Colors, type & borders</small></div><svg viewBox="0 0 600 145" className="settings-graph-preview" style={vars as React.CSSProperties} role="img" aria-label="Graph appearance preview">
      <style>{p.appearance.css}</style><g className="dag-graph">
        <g className="dag-edge"><path className="dag-edge__path" d="M220 74H365"/>{p.appearance.display.showEdgeLabels && <text className="dag-edge__label-text" x="280" y="58">supports</text>}</g>
        {[{x:35,label:"Concept",detail:"A connected idea"},{x:365,label:"Theorem",detail:"A derived result"}].map(item=><g key={item.label} className="dag-node" transform={`translate(${item.x} 39)`}><rect className="dag-node__shape" width="185" height="70" rx="12" style={p.hideNodeBorders?{stroke:"none"}:undefined}/><circle className="dag-node__pin" cx="20" cy="29" r="5" fill="var(--dag-text-strong)"/><text className="dag-node__title" x="36" y="34">{item.label}</text>{p.showNodeDetail&&<text x="36" y="52" fill="var(--dag-text-soft)" fontSize="11">{item.detail}</text>}</g>)}
      </g></svg></section>}
    {matches("appearance preset theme simple compact default slate blueprint contrast presentation") && <section className="settings-section"><h3>Style presets</h3><p>A starting point for your graph. Customize any value below.</p><div className="preset-grid">
      {GRAPH_APPEARANCE_PRESETS.map(preset=><button key={preset.id} className={selectedPreset?.id===preset.id?"is-selected":""} aria-pressed={selectedPreset?.id===preset.id} onClick={()=>p.onAppearancePresetChange(preset.id)}><span className="preset-sample" style={{background:preset.appearance.cssVars["--dag-node-fill"],color:preset.appearance.cssVars["--dag-text-strong"],borderColor:preset.appearance.cssVars["--dag-node-border"]}}><i/>Aa<span>→</span><i/></span><strong>{preset.label}</strong></button>)}
    </div></section>}
    {matches("appearance colors tokens fill border root edge active title soft text") && <section className="settings-section"><h3>Colors</h3><div className="color-settings-grid">{APPEARANCE_TOKEN_CONTROLS.filter(token=>token.key!=="--dag-title-font-size").map(token=><label key={token.key}><span>{token.label}</span><div><span className="color-swatch" style={{background:vars[token.key]}}/><input aria-label={token.label} value={p.cssVarDrafts[token.key] ?? vars[token.key] ?? ""} onChange={event=>p.onCssVarDraftsChange(current=>({...current,[token.key]:event.target.value}))} onBlur={event=>p.onAppearanceCssVarChange(token.key,event.target.value)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></div></label>)}</div></section>}
    {matches("appearance typography font title size bold italic") && <section className="settings-section"><h3>Typography</h3><div className="typography-settings"><label>Title font<select aria-label="Title font" value={titleFamily} onChange={event=>p.onAppearanceCssVarChange("--dag-title-font-family",event.target.value)}>{GRAPH_TITLE_FONT_OPTIONS.map(font=><option key={font.value} value={font.value}>{font.label}</option>)}</select></label><label>Size (px)<input aria-label="Title font size" type="number" min="10" max="28" value={p.titleSizeDraft} onChange={event=>p.onTitleSizeDraftChange(event.target.value)} onBlur={()=>p.onAppearanceCssVarChange("--dag-title-font-size",`${clampNumberInput(p.titleSizeDraft,10,28,p.titleFontSize)}px`)} onKeyDown={event=>{if(event.key==="Enter")event.currentTarget.blur();}}/></label><button className="studio-button" aria-label="Bold title" aria-pressed={vars["--dag-title-font-weight"]==="700"} onClick={()=>p.onAppearanceCssVarChange("--dag-title-font-weight",vars["--dag-title-font-weight"]==="700"?"400":"700")}><b>B</b></button><button className="studio-button" aria-label="Italic title" aria-pressed={vars["--dag-title-font-style"]==="italic"} onClick={()=>p.onAppearanceCssVarChange("--dag-title-font-style",vars["--dag-title-font-style"]==="italic"?"normal":"italic")}><i>I</i></button></div></section>}
    {matches("appearance visibility view details descriptions borders width labels edges") && <section className="settings-section"><h3>Visible details</h3>
      <Toggle label="Node descriptions" description="Show a short description under each title." checked={p.showNodeDetail} onChange={p.onNodeDetailToggle}/>
      <Toggle label="Node borders" description="Draw an outline around nodes." checked={!p.hideNodeBorders} onChange={p.onNodeBordersToggle}/>
      <Toggle label="Equal node widths" description="Align nodes to the widest visible node." checked={p.alignNodeWidthsToMax} onChange={p.onNodeWidthAlignToggle}/>
      <Toggle label="Edge labels" description="Show the relation value beside each edge." checked={p.appearance.display.showEdgeLabels} onChange={()=>p.onAppearanceDisplayChange("showEdgeLabels",!p.appearance.display.showEdgeLabels)}/>
    </section>}
    {matches("appearance custom css advanced stylesheet configuration import export reset") && <details className="settings-advanced" open={Boolean(p.query)}><summary>Advanced appearance</summary><section className="settings-section"><h3>Custom graph CSS</h3><p>Overrides graph styles, including the exported SVG.</p><textarea aria-label="Custom graph CSS" className="appearance-css-editor" spellCheck={false} value={p.appearanceCssDraft} rows={10} onChange={event=>p.onAppearanceCssDraftChange(event.target.value)}/><button className="studio-button" onClick={()=>p.onAppearanceCssChange(p.appearanceCssDraft)} disabled={p.appearanceCssDraft===p.appearance.css}>Apply CSS</button><h3>Appearance configuration</h3><div className="settings-inline-actions"><label className="studio-button settings-file-input">Import configuration<input type="file" accept=".json,application/json" aria-label="Import appearance configuration" onClick={p.onAppearanceImportClick} onChange={p.onAppearanceImportChange}/></label><button className="studio-button" onClick={p.onAppearanceExport}>Export configuration</button><button className="studio-button subtle-danger" onClick={p.onAppearanceReset}>Reset appearance</button></div></section></details>}
  </>;
}
function Toggle({label,description,checked,onChange}:{label:string;description:string;checked:boolean;onChange:()=>void}) {
  return <label className="settings-toggle-row"><span><strong>{label}</strong><small>{description}</small></span><input type="checkbox" role="switch" checked={checked} onChange={onChange}/></label>;
}
