import { isRecord } from "../shared/json";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { readLayoutConfig } from "./layoutConfig";

/** Explicit offline migration. Never import this into normal graph loading. */
export function migrateLegacyLayout(value: unknown, reference: string) {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.metadata.layout))
    throw new Error("Expected legacy embedded metadata.layout.");
  const old = value.metadata.layout;
  const layout = readLayoutConfig({ format: "graph-studio-layout", version: 1, charts: old });
  const graph = serializeDag(normalizeDagInput({ ...value, metadata: { ...value.metadata, layout: reference } }));
  return { graph, layout };
}
