import { normalizeDagInput } from "../graph/normalize";

/** Patch only the disk document's association, preserving unrelated saved content. */
export function bindLayoutReference(content: string, reference: string) {
  const graph = JSON.parse(content);
  normalizeDagInput(graph);
  return { ...graph, metadata: { ...graph.metadata, layout: reference } };
}
