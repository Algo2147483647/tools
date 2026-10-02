import { isRecord, normalizeDagInput, validateNodeKey } from "./normalize";
import { serializeDag } from "./serialize";
import { pruneEmptyGroups } from "./hierarchy";
import type { GraphEdge, NormalizedDag } from "./types";

export interface ImportGraphDocument {
  name: string;
  payload: unknown;
}
export type ConflictStrategy = "keep" | "merge" | "rename" | "replace";
interface ConflictResolution {
  strategy: ConflictStrategy;
  name?: string;
}
export type ImportResolutions = Record<string, ConflictResolution>;
interface ImportConflict {
  id: string;
  source: string;
  path: string;
  kind: "node" | "edge" | "field";
  existing: unknown;
  incoming: unknown;
  canMerge: boolean;
  canRename: boolean;
  canReplace?: boolean;
  resolution?: ConflictResolution;
}
interface ImportAnalysis {
  dag: NormalizedDag;
  conflicts: ImportConflict[];
  unresolved: ImportConflict[];
  documentCount: number;
}
const has = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const equal = (a: unknown, b: unknown): boolean => {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) return a.length === b.length && a.every((v, i) => equal(v, b[i]));
  if (isRecord(a) && isRecord(b))
    return (
      Object.keys(a).length === Object.keys(b).length && Object.keys(a).every((k) => has(b, k) && equal(a[k], b[k]))
    );
  return false;
};
const segment = (key: string) => key.replace(/~/g, "~0").replace(/\//g, "~1");
const set = (object: Record<string, unknown>, key: string, value: unknown) =>
  Object.defineProperty(object, key, {
    value: structuredClone(value),
    enumerable: true,
    writable: true,
    configurable: true,
  });
function unique(base: string, used: Iterable<string>): string {
  const names = new Set(used);
  let key = base,
    n = 2;
  while (names.has(key)) key = `${base}_${n++}`;
  return key;
}

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
  const conflicts: ImportConflict[] = [];
  const unresolved: ImportConflict[] = [];
  const decide = (
    index: number,
    path: string,
    kind: ImportConflict["kind"],
    existing: unknown,
    incoming: unknown,
    canMerge: boolean,
    canRename: boolean,
    canReplace = false,
  ) => {
    const id = JSON.stringify([index, path, kind]);
    const resolution = resolutions[id];
    const conflict: ImportConflict = {
      id,
      source: documents[index].name,
      path,
      kind,
      existing: structuredClone(existing),
      incoming: structuredClone(incoming),
      canMerge,
      canRename,
      canReplace,
      resolution,
    };
    conflicts.push(conflict);
    if (
      !resolution ||
      !["keep", "merge", "rename", "replace"].includes(resolution.strategy) ||
      (resolution.strategy === "replace" && !canReplace) ||
      (resolution.strategy === "merge" && !canMerge) ||
      (resolution.strategy === "rename" && !canRename)
    ) {
      unresolved.push(conflict);
      return undefined;
    }
    return resolution;
  };
  const mergeObject = (
    target: Record<string, unknown>,
    incoming: Record<string, unknown>,
    index: number,
    path: string,
  ) => {
    for (const [key, value] of Object.entries(incoming)) {
      if (!has(target, key)) {
        set(target, key, value);
        continue;
      }
      if (equal(target[key], value)) continue;
      const previous = target[key];
      const canMerge = (isRecord(previous) && isRecord(value)) || (Array.isArray(previous) && Array.isArray(value));
      const choice = decide(index, `${path}/${segment(key)}`, "field", previous, value, canMerge, true);
      if (!choice || choice.strategy === "keep") continue;
      if (choice.strategy === "rename") {
        const name =
          choice.name?.trim() ||
          unique(`${key}__import_${index + 1}`, [...Object.keys(target), ...Object.keys(incoming)]);
        if (
          !name ||
          has(target, name) ||
          has(incoming, name) ||
          (/^\/nodes\/[^/]+$/.test(path) && ["key", "parents", "children"].includes(name))
        )
          throw new Error(`Rename target "${name}" is reserved or already exists at ${path}.`);
        set(target, name, value);
      } else if (isRecord(previous) && isRecord(value)) mergeObject(previous, value, index, `${path}/${segment(key)}`);
      else if (Array.isArray(previous) && Array.isArray(value))
        set(target, key, [...previous, ...value.filter((item) => !previous.some((existing) => equal(existing, item)))]);
    }
  };
  for (let index = 1; index < parsed.length; index++) {
    const incoming = structuredClone(parsed[index]);
    const previousMembers = new Set([...Object.keys(output.nodes), ...Object.keys(output.hierarchy?.groups ?? {})]);
    const renameMap = new Map<string, string>();
    for (const [key, node] of Object.entries(incoming.nodes)) {
      if (has(output.hierarchy?.groups ?? {}, key))
        throw new Error(`Node "${key}" conflicts with an existing group ID. Rename it before merging.`);
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
        if (
          has(output.nodes, name) ||
          has(incoming.nodes, name) ||
          has(output.hierarchy?.groups ?? {}, name) ||
          has(incoming.hierarchy?.groups ?? {}, name)
        )
          throw new Error(`Node rename target "${name}" already exists.`);
        set(output.nodes, name, node);
        renameMap.set(key, name);
      }
    }
    if (incoming.hierarchy) {
      const hierarchy = incoming.hierarchy;
      output.hierarchy ??= { id: hierarchy.id, groups: {}, parentById: {} };
      const target = output.hierarchy;
      const groupRenames = new Map<string, string>();
      for (const [id, group] of Object.entries(hierarchy.groups)) {
        const collision = has(output.nodes, id) || has(target.groups, id);
        if (!collision) {
          set(target.groups, id, group);
          continue;
        }
        if (!has(output.nodes, id) && equal(target.groups[id], group)) continue;
        const choice = decide(
          index,
          `/hierarchy/groups/${segment(id)}`,
          "field",
          target.groups[id] ?? { node: id },
          group,
          false,
          true,
        );
        if (!choice || choice.strategy === "keep") {
          if (has(output.nodes, id)) groupRenames.set(id, "");
          continue;
        }
        const name =
          choice.name?.trim() ||
          unique(`${id}__import_${index + 1}`, [
            ...Object.keys(output.nodes),
            ...Object.keys(target.groups),
            ...Object.keys(hierarchy.groups),
          ]);
        validateNodeKey(name);
        if (has(output.nodes, name) || has(target.groups, name) || has(hierarchy.groups, name))
          throw new Error(`Group rename target "${name}" already exists.`);
        set(target.groups, name, group);
        groupRenames.set(id, name);
      }
      for (const rawId of [...Object.keys(incoming.nodes), ...Object.keys(hierarchy.groups)]) {
        const rawParent = has(hierarchy.parentById, rawId) ? hierarchy.parentById[rawId] : undefined;
        const id = groupRenames.get(rawId) ?? renameMap.get(rawId) ?? rawId;
        let parent: string | undefined = rawParent;
        while (parent !== undefined && groupRenames.get(parent) === "")
          parent = has(hierarchy.parentById, parent) ? hierarchy.parentById[parent] : undefined;
        const mappedParent = parent === undefined ? undefined : (groupRenames.get(parent) ?? parent);
        if (!id) continue;
        const existingParent = has(target.parentById, id) ? target.parentById[id] : undefined;
        if (existingParent === mappedParent) continue;
        if (!previousMembers.has(id)) {
          if (mappedParent !== undefined) set(target.parentById, id, mappedParent);
          continue;
        }
        const choice = decide(
          index,
          `/hierarchy/parentById/${segment(id)}`,
          "field",
          existingParent ?? null,
          mappedParent ?? null,
          false,
          false,
          true,
        );
        if (choice?.strategy === "replace") {
          if (mappedParent === undefined) delete target.parentById[id];
          else set(target.parentById, id, mappedParent);
        }
      }
      pruneEmptyGroups(output);
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
        ...(doc.hierarchy !== undefined ? { hierarchy: doc.hierarchy } : {}),
      })),
    );
  }
  return { dag: normalizeDagInput(output), conflicts, unresolved, documentCount: documents.length };
}
