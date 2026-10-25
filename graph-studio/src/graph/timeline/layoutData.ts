import { isRecord } from "../../shared/json";
import type { GraphDocument } from "../types";

export interface TimelineLayoutPlan {
  trackOrder: string[];
  eventOrder: string[];
  edgeRouting?: "avoid" | "direct";
}
export interface TimelineLayoutData {
  version: 1;
  mode: "algorithm" | "ai";
  plan?: TimelineLayoutPlan;
}
export function parseTimelineLayoutPlan(value: unknown): TimelineLayoutPlan {
  if (!isRecord(value)) throw new Error("Timeline layout must be an object.");
  const allowed = ["trackOrder", "eventOrder", "edgeRouting"];
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
