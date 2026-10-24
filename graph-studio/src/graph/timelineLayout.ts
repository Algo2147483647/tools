import type { GraphDocument } from "./types";
import { isRecord } from "../utils/json";

export interface TimelineLayoutPlan {
  trackOrder: string[];
  eventOrder: string[];
  nodeGap?: number;
  horizontalSpread?: number;
  edgeRouting?: "avoid" | "direct";
}
export interface TimelineLayoutData {
  version: 1;
  mode: "algorithm" | "ai";
  plan?: TimelineLayoutPlan;
}
export function parseTimelineLayoutPlan(value: unknown): TimelineLayoutPlan {
  if (!isRecord(value)) throw new Error("Timeline layout must be an object.");
  const allowed = ["trackOrder", "eventOrder", "nodeGap", "horizontalSpread", "edgeRouting"];
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unsupported timeline layout field: ${key}.`);
  const order = (key: string, limit: number) => {
    const list = value[key] === undefined ? [] : value[key];
    if (
      !Array.isArray(list) ||
      list.length > limit ||
      !list.every((id) => typeof id === "string" && id.trim().length > 0 && id.length <= 1024) ||
      new Set(list).size !== list.length
    )
      throw new Error(`Invalid ${key}: use unique names or IDs.`);
    return [...list] as string[];
  };
  const plan: TimelineLayoutPlan = { trackOrder: order("trackOrder", 2000), eventOrder: order("eventOrder", 2000) };
  for (const [key, min, max] of [
    ["nodeGap", 8, 160],
    ["horizontalSpread", 0.5, 3],
  ] as const) {
    if (value[key] === undefined) continue;
    const number = value[key];
    if (typeof number !== "number" || !Number.isFinite(number) || number < min || number > max)
      throw new Error(`${key} must be between ${min} and ${max}.`);
    plan[key] = number;
  }
  if (value.edgeRouting !== undefined) {
    if (value.edgeRouting !== "avoid" && value.edgeRouting !== "direct") throw new Error("Invalid edge routing.");
    plan.edgeRouting = value.edgeRouting;
  }
  return plan;
}
export function timelineTrack(node: Record<string, unknown>, flow = false): string {
  const value = flow ? node.type : node.track;
  if (flow) return typeof value === "string" && value ? value : "Events";
  return typeof value === "string" && value.trim() ? value.trim() : "Events";
}
export function validateTimelineLayoutPlan(plan: TimelineLayoutPlan, doc: GraphDocument, flow = false) {
  const tracks = new Set(Object.values(doc.nodes).map((node) => timelineTrack(node, flow)));
  for (const id of plan.eventOrder)
    if (!Object.prototype.hasOwnProperty.call(doc.nodes, id)) throw new Error(`Unknown timeline event: ${id}.`);
  for (const track of plan.trackOrder) if (!tracks.has(track)) throw new Error(`Unknown timeline track: ${track}.`);
}
export function readTimelineLayout(doc?: Pick<GraphDocument, "metadata"> | null): {
  data: TimelineLayoutData;
  warning?: string;
} {
  const value = isRecord(doc?.metadata?.layout) ? doc.metadata.layout.timeline : undefined;
  const fallback: TimelineLayoutData = { version: 1, mode: "algorithm" };
  if (value === undefined) return { data: fallback };
  try {
    if (!isRecord(value) || value.version !== 1 || (value.mode !== "algorithm" && value.mode !== "ai"))
      throw new Error("Unsupported saved timeline layout. Using Algorithm.");
    return {
      data: {
        version: 1,
        mode: value.mode,
        ...(value.plan !== undefined ? { plan: parseTimelineLayoutPlan(value.plan) } : {}),
      },
    };
  } catch (error) {
    return { data: fallback, warning: error instanceof Error ? error.message : "Invalid saved timeline layout." };
  }
}
export function writeTimelineLayout(doc: GraphDocument, data: TimelineLayoutData) {
  doc.metadata = {
    ...doc.metadata,
    layout: { ...(isRecord(doc.metadata?.layout) ? doc.metadata.layout : {}), timeline: data },
  };
}
export function repairTimelineLayout(doc: GraphDocument, rename?: { from: string; to: string }) {
  const { data, warning } = readTimelineLayout(doc);
  if (warning || !data.plan) return;
  const tracks = new Set(Object.values(doc.nodes).flatMap((node) => [timelineTrack(node), timelineTrack(node, true)]));
  writeTimelineLayout(doc, {
    ...data,
    plan: {
      ...data.plan,
      eventOrder: [...new Set(data.plan.eventOrder.map((id) => (id === rename?.from ? rename.to : id)))].filter((id) =>
        Object.prototype.hasOwnProperty.call(doc.nodes, id),
      ),
      trackOrder: data.plan.trackOrder.filter((track) => tracks.has(track)),
    },
  });
}
export function remapImportedTimelineLayout(doc: GraphDocument, nodeMap: Map<string, string>) {
  const { data, warning } = readTimelineLayout(doc);
  if (warning || !data.plan) return;
  writeTimelineLayout(doc, {
    ...data,
    plan: {
      ...data.plan,
      eventOrder: [...new Set(data.plan.eventOrder.map((id) => nodeMap.get(id) ?? id))],
    },
  });
}
