import { isRecord } from "../shared/json";
import { normalizeDagInput } from "../graph/normalize";
import { serializeDag } from "../graph/serialize";
import { parseLayoutDocument } from "./layoutProtocol";

/** Explicit offline migration. Never import this into normal graph loading. */
export function migrateLegacyLayout(value: unknown, reference: string) {
  if (!isRecord(value) || !isRecord(value.metadata) || !isRecord(value.metadata.layout))
    throw new Error("Expected legacy embedded metadata.layout.");
  const old = value.metadata.layout;
  const charts: Record<string, unknown> = {};
  if (isRecord(old.compound)) {
    const c = old.compound;
    if (c.constraints !== undefined && !Array.isArray(c.constraints)) throw new Error("Invalid legacy constraints.");
    charts.compound = {
      version: 1,
      method: c.method ?? "automatic",
      direction: c.direction ?? "AUTO",
      objective: c.objective === "compact" ? "compact" : "readability",
      constraints: (c.constraints ?? []).filter((entry: unknown) => isRecord(entry) && entry.type !== "pin"),
    };
  }
  if (isRecord(old.timeline))
    charts.timeline = {
      version: 1,
      mode: old.timeline.mode ?? "algorithm",
      ...(old.timeline.plan ? { plan: old.timeline.plan } : {}),
    };
  const layout = parseLayoutDocument({ format: "graph-studio-layout", version: 1, charts });
  const graph = serializeDag(normalizeDagInput({ ...value, metadata: { ...value.metadata, layout: reference } }));
  return { graph, layout };
}
