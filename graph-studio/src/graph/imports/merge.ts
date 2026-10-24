import { remapImportedLayoutData,repairLayoutData } from "../compound/layoutData";
import { normalizeDagInput,validateNodeKey } from "../normalize";
import { serializeDag } from "../serialize";
import { remapImportedTimelineLayout,repairTimelineLayout } from "../timeline/layoutData";
import type { GraphEdge,HierarchyEdge } from "../types";


import { createImportDecisions } from "./conflicts";
import { createFieldMerger } from "./fields";
import type { ImportAnalysis,ImportGraphDocument,ImportResolutions } from "./types";
import { equal,has,segment,set,unique } from "./values";
export type { ConflictStrategy,ImportGraphDocument,ImportResolutions } from "./types";
export function analyzeGraphImport(
  documents: ImportGraphDocument[],
  resolutions: ImportResolutions = {},
): ImportAnalysis {
  if (!documents.length) throw new Error("Select at least one graph document.");
  const parsed = documents.map((doc) => {
    try {
      return serializeDag(normalizeDagInput(doc.payload));
    } catch (error) {
      throw new Error(`${doc.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
  const output = structuredClone(parsed[0]);
  if (parsed.some((doc) => (doc.diagram ?? "dag") !== (output.diagram ?? "dag"))) {
    throw new Error(
      "DAG and Sankey documents use different edge semantics. Open them separately or explicitly convert them to the same diagram type before merging.",
    );
  }
  const { conflicts, unresolved, decide } = createImportDecisions(documents, resolutions);
  const mergeObject = createFieldMerger(decide);
  for (let index = 1; index < parsed.length; index++) {
    const incoming = structuredClone(parsed[index]);
    const renameMap = new Map<string, string>();
    const edgeRenameMap = new Map<string, string | null>();
    for (const [key, node] of Object.entries(incoming.nodes)) {
      if (!has(output.nodes, key)) {
        set(output.nodes, key, node);
        continue;
      }
      if (equal(output.nodes[key], node)) continue;
      const choice = decide(index, `/nodes/${segment(key)}`, "node", output.nodes[key], node, true, true);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "merge") mergeObject(output.nodes[key], node, index, `/nodes/${segment(key)}`);
      else {
        const name =
          choice.name?.trim() ||
          unique(`${key}__import_${index + 1}`, [...Object.keys(output.nodes), ...Object.keys(incoming.nodes)]);
        validateNodeKey(name);
        if (has(output.nodes, name) || has(incoming.nodes, name))
          throw new Error(`Node rename target "${name}" already exists.`);
        set(output.nodes, name, node);
        renameMap.set(key, name);
      }
    }
    if (incoming.hierarchy_edges !== undefined) {
      output.hierarchy_edges ??= [];
      for (const raw of incoming.hierarchy_edges) {
        const edge = {
          ...raw,
          source: renameMap.get(raw.source) ?? raw.source,
          target: renameMap.get(raw.target) ?? raw.target,
        };
        const matches: HierarchyEdge[] = output.hierarchy_edges.filter(
          (item) => item.target === edge.target || item.id === edge.id,
        );
        if (!matches.length) {
          output.hierarchy_edges.push(edge);
          continue;
        }
        if (matches.length === 1 && equal(matches[0], edge)) continue;
        const existing = matches.length === 1 ? matches[0] : matches;
        const sameChild = matches.some((item) => item.target === edge.target);
        const choice = decide(
          index,
          `/hierarchy_edges/${segment(edge.id)}`,
          "edge",
          existing,
          edge,
          false,
          !sameChild,
          true,
        );
        if (choice?.strategy === "replace") {
          output.hierarchy_edges = output.hierarchy_edges.filter(
            (item) => item.id !== edge.id && item.target !== edge.target,
          );
          output.hierarchy_edges.push(edge);
        } else if (choice?.strategy === "rename") {
          const id =
            choice.name?.trim() ||
            unique(
              `${edge.id}__import_${index + 1}`,
              output.hierarchy_edges.map((item) => item.id),
            );
          validateNodeKey(id);
          if (output.hierarchy_edges.some((item) => item.id === id || item.target === edge.target))
            throw new Error("Hierarchy edge rename must preserve unique IDs and one parent per child.");
          output.hierarchy_edges.push({ ...edge, id });
        }
      }
    }
    for (const edge of incoming.edges) {
      edge.source = renameMap.get(edge.source) ?? edge.source;
      edge.target = renameMap.get(edge.target) ?? edge.target;
      const pair = output.edges.find((e) => e.source === edge.source && e.target === edge.target);
      const sameId = output.edges.find((e) => e.id === edge.id);
      const existing = pair || sameId;
      if (!existing) {
        output.edges.push(edge);
        continue;
      }
      if (equal(existing, edge)) continue;
      const samePair = existing.source === edge.source && existing.target === edge.target;
      const choice = decide(index, `/edges/${segment(edge.id)}`, "edge", existing, edge, samePair, !pair);
      edgeRenameMap.set(edge.id, samePair ? existing.id : null);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "rename") {
        const id =
          choice.name?.trim() ||
          unique(`${edge.id}__import_${index + 1}`, [
            ...output.edges.map((e) => e.id),
            ...incoming.edges.map((e) => e.id),
          ]);
        validateNodeKey(id);
        if (output.edges.some((e) => e.id === id) || incoming.edges.some((e) => e.id === id))
          throw new Error(`Edge rename target "${id}" already exists.`);
        output.edges.push({ ...edge, id });
        edgeRenameMap.set(edge.id, id);
      } else {
        // Endpoint identity is fixed; all differing edge payloads go through explicit field decisions.
        const payload: Record<string, unknown> = {};
        if (edge.value !== undefined) payload.value = edge.value;
        if (edge.metadata !== undefined) payload.metadata = edge.metadata;
        const attrs: Record<string, unknown> = {};
        if (existing.value !== undefined) attrs.value = existing.value;
        if (existing.metadata !== undefined) attrs.metadata = existing.metadata;
        mergeObject(attrs, payload, index, `/edges/${segment(edge.id)}`);
        const extra = Object.fromEntries(Object.entries(attrs).filter(([k]) => k !== "value" && k !== "metadata"));
        existing.value = attrs.value as GraphEdge["value"];
        existing.metadata = attrs.metadata as GraphEdge["metadata"];
        if (Object.keys(extra).length) {
          existing.metadata ??= {};
          for (const [key, value] of Object.entries(extra))
            set(existing.metadata, unique(key, Object.keys(existing.metadata)), value);
        }
        if (existing.value === undefined) delete existing.value;
        if (existing.metadata === undefined) delete existing.metadata;
      }
    }
    if (incoming.metadata) {
      remapImportedLayoutData(incoming, renameMap, edgeRenameMap);
      remapImportedTimelineLayout(incoming, renameMap);
      output.metadata ??= {};
      mergeObject(output.metadata, incoming.metadata, index, "/metadata");
    }
    for (const key of ["id", "title"] as const) {
      if (incoming[key] === undefined) continue;
      if (output[key] === undefined) {
        output[key] = incoming[key];
        continue;
      }
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
  if (parsed.length > 1) {
    repairLayoutData(output, parsed[0]);
    repairTimelineLayout(output);
    output.metadata ??= {};
    // Preserve all original document headers and metadata, even when a user chooses the existing merged value.
    const archiveKey = unique("importSources", Object.keys(output.metadata));
    set(
      output.metadata,
      archiveKey,
      parsed.map((doc, i) => ({
        file: documents[i].name,
        ...(doc.id !== undefined ? { id: doc.id } : {}),
        ...(doc.title !== undefined ? { title: doc.title } : {}),
        ...(doc.metadata !== undefined ? { metadata: doc.metadata } : {}),
        ...(doc.hierarchy_edges !== undefined ? { hierarchy_edges: doc.hierarchy_edges } : {}),
      })),
    );
  }
  return { dag: normalizeDagInput(output), conflicts, unresolved, documentCount: documents.length };
}
