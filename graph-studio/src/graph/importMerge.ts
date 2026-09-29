import { getDefaultFieldMapping, type FieldMapping } from "./fieldMapping";
import { isRecord, normalizeDagInput, validateNodeKey } from "./normalize";
import { serializeDag } from "./serialize";
import type { GraphDocument, GraphEdge, NormalizedDag } from "./types";

export interface ImportGraphDocument { name: string; payload: unknown }
export type ConflictStrategy = "keep" | "merge" | "rename";
export interface ConflictResolution { strategy: ConflictStrategy; name?: string }
export type ImportResolutions = Record<string, ConflictResolution>;
export interface ImportConflict {
  id: string;
  source: string;
  path: string;
  kind: "node" | "edge" | "field";
  existing: unknown;
  incoming: unknown;
  canMerge: boolean;
  canRename: boolean;
  resolution?: ConflictResolution;
}
export interface ImportWarning { type: "info"; message: string }
export interface ImportAnalysis {
  dag: NormalizedDag;
  conflicts: ImportConflict[];
  unresolved: ImportConflict[];
  documentCount: number;
}
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v,i) => equal(v,b[i]));
  if (isRecord(a) && isRecord(b)) return Object.keys(a).length === Object.keys(b).length && Object.keys(a).every(k => has(b,k) && equal(a[k],b[k]));
  return false;
};
const segment = (key: string) => key.replace(/~/g,"~0").replace(/\//g,"~1");
const set = (object: Record<string, unknown>, key: string, value: unknown) => Object.defineProperty(object,key,{value:structuredClone(value),enumerable:true,writable:true,configurable:true});
function unique(base: string, used: Iterable<string>): string {
  const names = new Set(used); let key = base, n = 2;
  while (names.has(key)) key = `${base}_${n++}`;
  return key;
}

export function analyzeGraphImport(documents: ImportGraphDocument[], resolutions: ImportResolutions = {}): ImportAnalysis {
  if (!documents.length) throw new Error("Select at least one graph document.");
  const parsed = documents.map(doc => {
    try { return serializeDag(normalizeDagInput(doc.payload)); }
    catch (error) { throw new Error(`${doc.name}: ${error instanceof Error ? error.message : String(error)}`); }
  });
  const output = structuredClone(parsed[0]);
  if (parsed.some(doc => (doc.diagram ?? "dag") !== (output.diagram ?? "dag"))) {
    throw new Error("DAG and Sankey documents use different edge semantics. Open them separately or explicitly convert them to the same diagram type before merging.");
  }
  const conflicts: ImportConflict[] = [];
  const unresolved: ImportConflict[] = [];
  const decide = (index: number, path: string, kind: ImportConflict["kind"], existing: unknown, incoming: unknown, canMerge: boolean, canRename: boolean) => {
    const id = JSON.stringify([index,path,kind]);
    const resolution = resolutions[id];
    const conflict: ImportConflict = { id,source:documents[index].name,path,kind,existing:structuredClone(existing),incoming:structuredClone(incoming),canMerge,canRename,resolution };
    conflicts.push(conflict);
    if (!resolution || !["keep", "merge", "rename"].includes(resolution.strategy) || resolution.strategy === "merge" && !canMerge || resolution.strategy === "rename" && !canRename) {
      unresolved.push(conflict); return undefined;
    }
    return resolution;
  };
  const mergeObject = (target: Record<string, unknown>, incoming: Record<string, unknown>, index: number, path: string) => {
    for (const [key,value] of Object.entries(incoming)) {
      if (!has(target,key)) { set(target,key,value); continue; }
      if (equal(target[key],value)) continue;
      const previous = target[key];
      const canMerge = isRecord(previous) && isRecord(value) || Array.isArray(previous) && Array.isArray(value);
      const choice = decide(index,`${path}/${segment(key)}`,"field",previous,value,canMerge,true);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "rename") {
        const name = choice.name?.trim() || unique(`${key}__import_${index+1}`,[...Object.keys(target),...Object.keys(incoming)]);
        if (!name || has(target,name) || has(incoming,name) || /^\/nodes\/[^/]+$/.test(path) && ["key","parents","children"].includes(name)) throw new Error(`Rename target "${name}" is reserved or already exists at ${path}.`);
        set(target,name,value);
      } else if (isRecord(previous) && isRecord(value)) mergeObject(previous,value,index,`${path}/${segment(key)}`);
      else if (Array.isArray(previous) && Array.isArray(value)) set(target,key,[...previous,...value.filter(item => !previous.some(existing => equal(existing,item)))]);
    }
  };
  for (let index=1;index<parsed.length;index++) {
    const incoming = structuredClone(parsed[index]);
    const renameMap = new Map<string,string>();
    for (const [key,node] of Object.entries(incoming.nodes)) {
      if (!has(output.nodes,key)) { set(output.nodes,key,node); continue; }
      if (equal(output.nodes[key],node)) continue;
      const choice=decide(index,`/nodes/${segment(key)}`,"node",output.nodes[key],node,true,true);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "merge") mergeObject(output.nodes[key],node,index,`/nodes/${segment(key)}`);
      else {
        const name=choice.name?.trim() || unique(`${key}__import_${index+1}`,[...Object.keys(output.nodes),...Object.keys(incoming.nodes)]);
        validateNodeKey(name);
        if (has(output.nodes,name) || has(incoming.nodes,name)) throw new Error(`Node rename target "${name}" already exists.`);
        set(output.nodes,name,node); renameMap.set(key,name);
      }
    }
    for (const edge of incoming.edges) {
      edge.source=renameMap.get(edge.source) ?? edge.source;
      edge.target=renameMap.get(edge.target) ?? edge.target;
      const pair=output.edges.find(e=>e.source===edge.source && e.target===edge.target);
      const sameId=output.edges.find(e=>e.id===edge.id);
      const existing=pair || sameId;
      if (!existing) { output.edges.push(edge); continue; }
      if (equal(existing,edge)) continue;
      const samePair=existing.source===edge.source && existing.target===edge.target;
      const choice=decide(index,`/edges/${segment(edge.id)}`,"edge",existing,edge,samePair,!pair);
      if (!choice || choice.strategy==="keep") continue;
      if (choice.strategy==="rename") {
        const id=choice.name?.trim() || unique(`${edge.id}__import_${index+1}`,[...output.edges.map(e=>e.id),...incoming.edges.map(e=>e.id)]);
        validateNodeKey(id);
        if (output.edges.some(e=>e.id===id) || incoming.edges.some(e=>e.id===id)) throw new Error(`Edge rename target "${id}" already exists.`);
        output.edges.push({...edge,id});
      } else {
        // Endpoint identity is fixed; all differing edge payloads go through explicit field decisions.
        const payload: Record<string,unknown> = {};
        if (edge.value !== undefined) payload.value=edge.value;
        if (edge.metadata !== undefined) payload.metadata=edge.metadata;
        const attrs: Record<string,unknown> = {};
        if (existing.value !== undefined) attrs.value=existing.value;
        if (existing.metadata !== undefined) attrs.metadata=existing.metadata;
        mergeObject(attrs,payload,index,`/edges/${segment(edge.id)}`);
        const extra=Object.fromEntries(Object.entries(attrs).filter(([k])=>k!=="value"&&k!=="metadata"));
        existing.value=attrs.value as GraphEdge["value"];
        existing.metadata=attrs.metadata as GraphEdge["metadata"];
        if (Object.keys(extra).length) {
          existing.metadata ??= {};
          for(const [key,value] of Object.entries(extra)) set(existing.metadata,unique(key,Object.keys(existing.metadata)),value);
        }
        if (existing.value === undefined) delete existing.value;
        if (existing.metadata === undefined) delete existing.metadata;
      }
    }
    if (incoming.metadata) {
      output.metadata ??= {};
      mergeObject(output.metadata,incoming.metadata,index,"/metadata");
    }
    for (const key of ["id", "title"] as const) {
      if (incoming[key] === undefined) continue;
      if (output[key] === undefined) { output[key] = incoming[key]; continue; }
      if (output[key] === incoming[key]) continue;
      const choice = decide(index, `/${key}`, "field", output[key], incoming[key], false, true);
      if (choice?.strategy === "rename") {
        output.metadata ??= {};
        const name = choice.name?.trim() || unique(`${key}__import_${index + 1}`, Object.keys(output.metadata));
        if (has(output.metadata, name)) throw new Error(`Metadata rename target "${name}" already exists.`);
        set(output.metadata, name, incoming[key]);
      }
    }
  }
  if (parsed.length>1) {
    output.metadata ??= {};
    // Preserve all original document headers and metadata, even when a user chooses the existing merged value.
    const archiveKey=unique("importSources",Object.keys(output.metadata));
    set(output.metadata,archiveKey,parsed.map((doc,i)=>({file:documents[i].name,...(doc.id!==undefined?{id:doc.id}:{}),...(doc.title!==undefined?{title:doc.title}:{}),...(doc.metadata!==undefined?{metadata:doc.metadata}:{})})));
  }
  return {dag:normalizeDagInput(output),conflicts,unresolved,documentCount:documents.length};
}

export function buildImportedDag(documents: ImportGraphDocument[], _mapping?: FieldMapping, resolutions: ImportResolutions = {}) {
  const analysis=analyzeGraphImport(documents,resolutions);
  if (analysis.unresolved.length) throw new Error(`${analysis.unresolved.length} import conflict(s) require a strategy before loading.`);
  return {...analysis,mapping:getDefaultFieldMapping(),warnings:[] as ImportWarning[],duplicateRenameCount:analysis.conflicts.filter(c=>c.resolution?.strategy==="rename").length};
}
