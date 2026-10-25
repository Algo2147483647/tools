import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import LayoutSchema from "../components/settings/LayoutSchema";
import { createLayoutResult, parseLayoutResult, layoutResultFields } from "../schema/layoutResult";
import { applyLayoutResult } from "../layout/shared/applyLayoutResult";
import { createLayoutConfigFile, readLayoutConfig, parseLayoutConfigFile } from "../schema/layoutConfig";
import { defaultLayoutSession, layoutSessionFromConfig, parseLayoutSession, repairLayoutSession } from "../schema/layoutSession";
import { captureLayoutGeometry, restoreLayoutGeometry, graphLayoutIdentity, layoutIdentity, renderingSettings } from "../schema/layoutGeometry";
import { layoutFieldSummary, layoutFieldValues } from "../schema/fieldValues";
import { defaultSpaceView } from "../graph/space";
import { normalizeDagInput } from "../graph/normalize";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { buildTimelineStage } from "../layout/timeline/layout";
import type { TimelineLayoutInput } from "../layout/timeline/input-types";
import type { StageData } from "../layout/shared/types";
import { validateTimelineArrangement } from "../layout/timeline/layout-quality";
import { runTimelineAiLayout } from "../layout/timeline/ai/workflow";
import { readLinkedLayout } from "../workspace/linkedLayout";
import { graphReducer } from "../app/document/graphReducer";
import { createInitialGraphState } from "../app/document/initialState";
import { defineSuite, defineTest } from "./harness";
export function timelineFixture(orientation: "vertical" | "horizontal" = "vertical") {
  const dag = normalizeDagInput({
    format: "graph-studio",
    version: 3,
    metadata: { timeline: { clock: { mode: "relative", unit: "minute" } } },
    nodes: {
      a: { title: "Start", track: "A", time: { at: 0 } },
      b: { title: "Work", track: "B", time: { start: 2, end: 8 } },
      c: { title: "Finish", track: "A", time: { at: 10 } },
    },
    edges: [
      { id: "ab", source: "a", target: "b" },
      { id: "bc", source: "b", target: "c" },
    ],
  });
  const settings = { ...getDefaultChartStyle("timeline").timeline!, orientation };
  const input: TimelineLayoutInput = { dag, selection: { type: "full" }, timelineSettings: settings, now: 0 };
  const stage = buildTimelineStage(input)!;
  const document = defaultLayoutSession();
  const scope = {
    selection: input.selection,
    compound: { focusGroupId: null, collapsedGroupIds: [] },
    activeType: "",
    activeTrack: "",
    timelineRange: null,
    spatial: defaultSpaceView(null),
  };
  document.activeChart = "timeline";
  document.renderings = {
    timeline: {
      graphFingerprint: graphLayoutIdentity(dag),
      settingsFingerprint: layoutIdentity(renderingSettings("timeline", document.charts, scope, settings)),
      scope,
      timelineSettings: settings,
      geometry: captureLayoutGeometry(stage),
    },
  };
  return { input, dag, settings, stage, document, scope };
}


export function movedTimeline(stage: StageData, id: string, delta: number) {
  const layout = createLayoutResult(stage, "timeline"), cross = stage.timeline!.orientation === "horizontal" ? 1 : 0;
  layout.geometry.size[cross] += delta;
  const node = layout.geometry.nodes.find(n => n.id === id)!;
  node.position[cross] += delta; node.label![cross] += delta;
  const edges = new Map(stage.edges.map(e => [e.id,e]));
  for (const route of layout.geometry.edges) { const edge = edges.get(route.id)!; if (edge.source===id) route.points![0][cross]+=delta; if(edge.target===id)route.points!.at(-1)![cross]+=delta; }
  return layout;
}

export const layoutPersistenceSuite = defineSuite("Layout configuration and result contract", [
  defineTest("configuration projection excludes all session geometry and concrete arrangement data", () => {
    const { document, settings } = timelineFixture();
    document.charts.timeline.mode = "ai"; settings.pins = { b: 800 };
    const file = createLayoutConfigFile(document, "timeline", settings);
    assert.deepEqual(Object.keys(file).sort(), ["chartType", "format", "settings", "version"]);
    for (const key of ["geometry", "position", "plan", "basis", "scope", "fingerprint", "pins", "trackOrder", "eventOrder"]) assert.ok(!JSON.stringify(file).includes(key), key);
    const loaded = layoutSessionFromConfig(file);
    assert.equal(loaded.renderings, undefined); assert.equal(loaded.charts.timeline.mode, "ai");
    document.charts.compound.constraints = [{ type: "flow-order", scopeId: null, nodeIds: ["a", "b"], strength: "soft" }];
    assert.ok(!JSON.stringify(createLayoutConfigFile(document, "compound")).includes("constraints"));
    assert.throws(() => parseLayoutConfigFile({ ...file, geometry: {} }));
    assert.throws(() => parseLayoutConfigFile({ ...file, settings: { mode:"ai", view:{ pins:{} } } }));
    assert.throws(() => parseLayoutConfigFile({ ...file, settings: { mode:"ai", view:{ compactness:2 } } }));
  }),
  defineTest("legacy associations ignore even invalid geometry and restore settings only", async () => {
    const { dag, document, settings } = timelineFixture("horizontal");
    const file = createLayoutConfigFile(document,"timeline",settings);
    const legacy = { format:"graph-studio-layout",version:3,chartType:"timeline",layout:{settings:{...file.settings,plan:{placements:[{id:"b",cross:9999}]}},geometry:{corrupt:true}}};
    assert.deepEqual(readLayoutConfig(legacy),file);
    const linked = await readLinkedLayout({...dag,metadata:{...dag.metadata,layout:"graph.layout.json"}},"graph.json",{name:"fixture",handle:null,files:new Map([["graph.layout.json",{path:"graph.layout.json",handle:null,file:new File([JSON.stringify(legacy)],"graph.layout.json")}]])});
    assert.equal(linked.layoutNotice,undefined); assert.equal(linked.linkedLayout!.renderings,undefined);
    assert.equal(linked.linkedLayout!.timelineView!.orientation,"horizontal");
    assert.deepEqual(await readLinkedLayout(dag,"graph.json"),{});
  }),
  defineTest("AI positions and paths render exactly in both orientations, preserving content, dates and pins", () => {
    for(const orientation of ["vertical","horizontal"] as const) {
      const { stage } = timelineFixture(orientation), result = movedTimeline(stage,"b",300);
      const rendered = applyLayoutResult(result,stage);
      assert.deepEqual(createLayoutResult(rendered,"timeline"),result);
      assert.deepEqual(validateTimelineArrangement(stage,rendered),[]);
      assert.deepEqual(rendered.dag,stage.dag);
      assert.throws(()=>applyLayoutResult(result,stage,{b:1}),/pinned/);
      if(orientation==="horizontal")for(const node of rendered.nodes){const canonical=rendered.timeline!.canonicalStage!.nodeMap[node.key];assert.equal(canonical.x,node.y);assert.equal(canonical.timeline!.labelX,node.timeline!.labelY);}
      const changed=structuredClone(result);changed.geometry.nodes[0].position[orientation==="vertical"?1:0]+=1;
      assert.throws(()=>applyLayoutResult(changed,stage),/time coordinate/);
      changed.geometry.nodes.pop();assert.throws(()=>applyLayoutResult(changed,stage),/complete current scope/);
      const detached=structuredClone(result);detached.geometry.edges[0].points![0][0]+=3;
      assert.throws(()=>applyLayoutResult(detached,stage),/time anchors/);
    }
  }),
  defineTest("Schema uses the provider contract and only fields belonging to the selected chart", () => {
    for(const chart of ["compound","timeline","node-link","sankey","spatial"] as const){
      const markup=renderToStaticMarkup(createElement(LayoutSchema,{stage:null,chartType:chart}));
      assert.equal(new Set(layoutResultFields(chart).map(f=>f.path)).size,layoutResultFields(chart).length);
      assert.ok(markup.includes("geometry.nodes[].position"));
      assert.equal(markup.includes("geometry.groups[].position"),chart==="compound");
      assert.equal(markup.includes("geometry.nodes[].label"),chart==="timeline");
      assert.ok(!markup.includes("Fingerprint")&&!markup.includes("displayTitle")&&!layoutResultFields(chart).some(field=>field.path.includes("settings")));
      assert.deepEqual(parseLayoutResult(createLayoutResult(null,chart),chart),createLayoutResult(null,chart));
    }
  }),
  defineTest("session renderings preserve current graph text and are invalidated by graph edits", () => {
    const { stage, document, dag }=timelineFixture();
    const parsed=parseLayoutSession(document), geometry=parsed.renderings!.timeline!.geometry;
    const fresh={...stage,nodeMap:{...stage.nodeMap,a:{...stage.nodeMap.a,displayTitle:"Current title"}}};
    assert.equal(restoreLayoutGeometry(geometry,fresh).nodeMap.a.displayTitle,"Current title");
    assert.deepEqual(captureLayoutGeometry(restoreLayoutGeometry(geometry,stage)),geometry);
    const changed={...dag,nodes:{...dag.nodes,a:{...dag.nodes.a,title:"Changed"}}};
    assert.equal(repairLayoutSession(document,changed).renderings!.timeline,undefined);
    const invalid=structuredClone(document);invalid.renderings!.timeline!.geometry.nodes[0].position[0]=Infinity;
    assert.throws(()=>parseLayoutSession(invalid),/geometry/);
  }),
  defineTest("timeline geometry commit is undoable and stale commits cannot change another document", () => {
    const {dag,document,stage,scope,settings}=timelineFixture();
    let state=graphReducer(createInitialGraphState(),{type:"graphLoaded",dag,documentId:"test",fileName:"graph.json",selection:{type:"full"},status:""});
    const data={version:1 as const,mode:"ai" as const};
    const rendering={...document.renderings!.timeline!,geometry:captureLayoutGeometry(applyLayoutResult(movedTimeline(stage,"b",200),stage)),settingsFingerprint:layoutIdentity(renderingSettings("timeline",{...document.charts,timeline:data},scope,settings))};
    const action={type:"timelineLayoutCommitted" as const,generation:state.document.generation,revision:state.editHistory.revision,beforeDag:dag,historyBase:state.editHistory,data,rendering};
    state=graphReducer(state,action);assert.deepEqual(state.layoutSession.data.renderings!.timeline,rendering);assert.equal(state.source.dirty,false);
    const undo=graphReducer(state,{type:"undoRequested"});assert.equal(undo.layoutSession.data.renderings?.timeline,undefined);
    const redo=graphReducer(undo,{type:"redoRequested"});assert.deepEqual(redo.layoutSession.data.renderings!.timeline,rendering);
    assert.equal(graphReducer(state,{...action,generation:state.document.generation-1}).layoutSession,state.layoutSession);
  }),
  defineTest("generic Schema value presentation preserves coordinate tuples", () => {
    const value={geometry:{nodes:[{id:"a",position:[1,2]},{id:"b",position:[3,4]}]}};
    assert.deepEqual(layoutFieldValues(value,"geometry.nodes[].id"),["a","b"]);
    assert.equal(layoutFieldSummary(value,"geometry.nodes[].position"),"[1,2] · [3,4]");
  }),
  defineTest("timeline AI observes, revises and explicitly selects exact geometry", async () => {
    const {input,stage}=timelineFixture(); const previous=globalThis.fetch; const requests:any[]=[];
    const decisions=[{action:"evaluate",hypothesis:"Separate",layout:movedTimeline(stage,"b",400)},{action:"evaluate",hypothesis:"Compact",layout:movedTimeline(stage,"b",200)},{action:"finish",candidateId:"trial-2",summary:"Selected the compact layout."}];
    globalThis.fetch=(async (_url:unknown,init?:{body?:string})=>{if(!init?.body)return new Response(JSON.stringify({data:[]}));requests.push(JSON.parse(init.body));assert.ok(requests.length<=decisions.length);return new Response(JSON.stringify({choices:[{finish_reason:"stop",message:{content:JSON.stringify(decisions[requests.length-1])}}]}));}) as typeof fetch;
    try {const result=await runTimelineAiLayout({settings:{provider:"deepseek",baseUrl:"http://localhost/mock",model:"test",apiKey:""},input,baseline:stage,message:"Arrange",signal:new AbortController().signal});assert.deepEqual(createLayoutResult(result.stage,"timeline"),decisions[1].layout);assert.equal(result.evaluations,2);assert.ok(result.changed);assert.deepEqual(requests[0].thinking,{type:"enabled"});assert.ok(requests[1].messages.at(-1).content.includes('"crossings"'));assert.ok(!("max_tokens" in requests[0]));}finally{globalThis.fetch=previous;}
  }),
]);
