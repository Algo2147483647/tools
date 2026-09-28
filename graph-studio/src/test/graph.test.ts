import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { applyGraphCommand, collectSubtreeNodeKeys } from "../graph/commands";
import { createGraphDocument, normalizeDagInput } from "../graph/normalize";
import { serializeDag, structuredCloneValue } from "../graph/serialize";
import { getNodeChildren, getNodeParents } from "../graph/accessors";
import { parseRelationValue, formatRelationValue } from "../graph/relations";
import { getDefaultFieldMapping } from "../graph/fieldMapping";
import { getParentLevelSelection, getInitialSelection, remapSelectionKeys, removeSelectionKeys, sanitizeNodeLabel } from "../graph/selectors";
import { getGraphTypeOptions, projectGraphByType } from "../graph/typeFilter";
import { createInitialCanvasDag } from "../graph/initialCanvas";
import { buildStageData } from "../layout/stage-layout";
import { parseRawNodeEditorValue, buildRawNodeEditorValue } from "../components/nodeDetailRawJson";
import { defineSuite, defineTest } from "./harness";
import { createSampleDag, createForestDag } from "./fixtures";
const m=getDefaultFieldMapping();
export const graphSuite=defineSuite("v2 document and graph",[
 defineTest("bundled sample uses the native protocol and preserves its edges",()=>{
   const sample=JSON.parse(readFileSync(new URL("../../public/example.json",import.meta.url),"utf8"));
   const dag=normalizeDagInput(sample);
   assert.equal(Object.keys(dag.nodes).length,111);assert.equal(dag.edges.length,141);
   assert.deepEqual(serializeDag(dag),sample);
 }),
 defineTest("relation form values round-trip scalars without changing strings to booleans or numbers",()=>{
   for(const value of [null,true,false,12,1e30,"true","null","12","", "  spaced  ","a\nb"]) {
     assert.equal(parseRelationValue(formatRelationValue(value)),value);
   }
   const source=createGraphDocument({A:{},B:{}},[{id:"ab",source:"A",target:"B",value:null}]);
   const updated=applyGraphCommand(source,{type:"setChildren",key:"A",children:["B"]}).dag;
   assert.equal(updated.edges[0].value,null);
 }),
 defineTest("stage uses edge IDs and synthetic roots cannot replace real nodes",()=>{
   const source=createGraphDocument({__graph_root__:{title:"Real root"},A:{},B:{}},[{id:"stable-id",source:"A",target:"B"}]);
   for(const layoutMode of ["level","sugiyama","dagre"] as const){
     const stage=buildStageData({dag:source,selection:{type:"full"},layoutMode});
     assert.ok(stage);assert.equal(stage.nodes.length,3);assert.equal(stage.edges[0].id,"stable-id");
   }
 }),
 defineTest("document metadata and arbitrary node/edge metadata round-trip without adjacency fields",()=>{
   const input={format:"graph-studio",version:2,id:"test",title:"Test",metadata:{owner:"me",nested:[null,true,3]},
     nodes:{A:{title:"Alpha",custom:{x:[1,2]}},B:{}},edges:[{id:"edge",source:"A",target:"B",value:null,metadata:{source:"book"}}]};
   const dag=normalizeDagInput(input);
   assert.deepEqual(serializeDag(dag),input);
   assert.deepEqual(getNodeChildren(dag.nodes.A,m),{B:null});
   assert.deepEqual(getNodeParents(dag.nodes.B,m),{A:null});
   assert.deepEqual(Object.keys(dag.nodes.A),["title","custom"]);
   assert.throws(()=>{dag.nodes.A.children={};});
   assert.deepEqual(serializeDag(normalizeDagInput(serializeDag(dag))),input);
 }),
 defineTest("old and unknown document formats are rejected",()=>{
   for(const input of [{A:{}},[{key:"A"}],{nodes:[{key:"A"}]},{format:"unknown",version:2,nodes:{},edges:[]},{format:"graph-studio",version:3,nodes:{},edges:[]}]) assert.throws(()=>normalizeDagInput(input),/Unsupported graph format/);
   assert.throws(()=>normalizeDagInput({format:"graph-studio",version:2,nodes:{},edges:[],extra:1}),/Unknown document field/);
 }),
 defineTest("invalid node fields, missing endpoints and duplicate edge identities are rejected",()=>{
   const base={format:"graph-studio",version:2,nodes:{A:{},B:{},C:{}},edges:[]};
   for(const node of [null,3,[],{parents:{}},{children:{}},{key:"A"},{type:["x"]}]) assert.throws(()=>normalizeDagInput({...base,nodes:{A:node}}));
   assert.throws(()=>normalizeDagInput({...base,edges:[{id:"e",source:"A",target:"Missing"}]}),/endpoints/);
   assert.throws(()=>normalizeDagInput({...base,edges:[{id:"e",source:"A",target:"B"},{id:"e",source:"A",target:"C"}]}),/duplicate edge ID/);
   assert.throws(()=>normalizeDagInput({...base,edges:[{id:"e",source:"A",target:"A"}]}),/self-loops/);
   assert.throws(()=>normalizeDagInput({...base,edges:[{id:"e",source:"A",target:"B",value:{x:1}}]}),/scalar/);
 }),
 defineTest("special object keys survive serialization and edge indexes",()=>{
   const dag=normalizeDagInput(JSON.parse('{"format":"graph-studio","version":2,"nodes":{"__proto__":{},"constructor":{}},"edges":[{"id":"e","source":"__proto__","target":"constructor","value":false}]}'));
   assert.deepEqual(Object.keys(dag.nodes),["__proto__","constructor"]);
   const constructorKey: string = "constructor";
   assert.deepEqual(getNodeParents(dag.nodes[constructorKey],m),JSON.parse('{"__proto__":false}'));
   assert.equal(Object.keys(serializeDag(dag).nodes).length,2);
 }),
 defineTest("node edits preserve incident edges and metadata",()=>{
   const source=createSampleDag();source.metadata={title:"metadata"};source.edges[0].metadata={proof:1};
   const edited=applyGraphCommand(source,{type:"updateNodeFields",key:"B",fields:{title:"Beta 2"}}).dag;
   assert.deepEqual(edited.edges,source.edges);assert.deepEqual(edited.metadata,source.metadata);
   assert.equal(edited.nodes.B.title,"Beta 2");assert.equal(source.nodes.B.title,"Beta");
   assert.throws(()=>applyGraphCommand(source,{type:"updateNodeFields",key:"B",fields:{children:{D:"new"}}}),/not allowed/);
 }),
 defineTest("relation editing changes one edge and derives both indexes, preserving edge identity",()=>{
   const source=createSampleDag();source.edges[0].metadata={proof:1};
   const updated=applyGraphCommand(source,{type:"setParentRelations",key:"B",parents:{A:"new"}}).dag;
   assert.deepEqual(updated.edges[0],{...source.edges[0],value:"new"});
   assert.deepEqual(getNodeChildren(updated.nodes.A,m),{B:"new",C:"edge_ac"});
   assert.deepEqual(getNodeParents(updated.nodes.B,m),{A:"new"});
   assert.equal(source.edges[0].value,"edge_ab");
 }),
 defineTest("rename and delete update authoritative edge endpoints",()=>{
   const source=createSampleDag();
   const renamed=applyGraphCommand(source,{type:"renameNode",oldKey:"B",newKey:"Renamed"}).dag;
   assert.equal(renamed.edges[0].target,"Renamed");assert.equal(renamed.edges[2].source,"Renamed");
   assert.equal(renamed.edges[0].id,"ab");assert.equal(source.edges[0].target,"B");
   assert.deepEqual(collectSubtreeNodeKeys(source,"B").sort(),["B","D"]);
   const deleted=applyGraphCommand(source,{type:"deleteSubtree",rootKey:"B"}).dag;
   assert.deepEqual(Object.keys(deleted.nodes),["A","C"]);assert.deepEqual(deleted.edges,[source.edges[1]]);
 }),
 defineTest("cloning and empty documents keep a consistent graph model",()=>{
   const source=createSampleDag(); const clone=structuredCloneValue(source);
   assert.deepEqual(getNodeChildren(clone.nodes.A,m),{B:"edge_ab",C:"edge_ac"});
   assert.equal(buildStageData({dag:createGraphDocument(),selection:{type:"full"}}),null);
   assert.equal(serializeDag(createInitialCanvasDag()).version,2);
 }),
 defineTest("type projection bridges hidden paths and layouts use derived indexes",()=>{
   const source=createSampleDag();source.nodes.A.type=source.nodes.C.type=source.nodes.D.type="visible";source.nodes.B.type="hidden";
   const before=serializeDag(source);const projected=projectGraphByType(source,"visible");
   assert.deepEqual(Object.keys(projected.nodes).sort(),["A","C","D"]);
   assert.equal(projected.edges.find(e=>e.target==="D")?.value,"filtered_path");
   assert.deepEqual(serializeDag(source),before);
   assert.deepEqual(getGraphTypeOptions(source),["hidden","visible"]);
   assert.equal(projectGraphByType(source,""),source);
   assert.equal(Object.keys(projectGraphByType(source,"missing").nodes).length,0);
   for(const layoutMode of ["level","sugiyama","dagre"] as const){
     const stage=buildStageData({dag:projected,selection:{type:"full"},layoutMode});
     assert.ok(stage);assert.equal(stage.nodes.length,3);assert.equal(stage.edges.length,2);
   }
 }),
 defineTest("selectors still navigate and repair node selections",()=>{
   const source=createSampleDag();
   assert.deepEqual(getInitialSelection(source),{type:"node",key:"A"});
   assert.deepEqual(getInitialSelection(createForestDag()),{type:"full"});
   assert.deepEqual(getParentLevelSelection(source,["D"]),{type:"node",key:"B"});
   assert.deepEqual(remapSelectionKeys({type:"node",key:"B"},k=>k==="B"?"B2":k),{type:"node",key:"B2"});
   assert.equal(removeSelectionKeys({type:"node",key:"B"},new Set(["B"])),null);
   assert.equal(sanitizeNodeLabel("Alpha-Beta_Title"),"Alpha-Beta Title");
 }),
 defineTest("raw node editor uses explicit id/data envelope and does not guess wrappers",()=>{
   const raw=buildRawNodeEditorValue("A",{metadata:{difficulty:"easy"}},m);
   assert.deepEqual(parseRawNodeEditorValue(raw,"",m),{ok:true,nextKey:"A",fields:{metadata:{difficulty:"easy"}}});
   assert.equal(parseRawNodeEditorValue('{"metadata":{"difficulty":"easy"}}',"A",m).ok,false);
 }),
]);
