import { isRecord } from "../../shared/json";
import type { GraphDocument } from "../types";

export interface TimelineLayoutPlan {
  trackOrder: string[];
  eventOrder: string[];
  edgeRouting?: "avoid" | "direct";
  /** Absolute canvas pixels perpendicular to time; label positions are physical x/y. */
  placements?: { id: string; cross: number; label?: { x: number; y: number } }[];
  routes?: { id: string; points: { x: number; y: number }[]; label?: { x: number; y: number } }[];
}
export interface TimelineLayoutData {
  version: 1;
  mode: "algorithm" | "ai";
  basis?: string;
  plan?: TimelineLayoutPlan;
}
export function parseTimelineLayoutPlan(value: unknown): TimelineLayoutPlan {
  if (!isRecord(value)) throw new Error("Timeline layout must be an object.");
  const allowed = ["trackOrder", "eventOrder", "edgeRouting", "placements", "routes"];
  for (const key of Object.keys(value))
    if (!allowed.includes(key)) throw new Error(`Unsupported timeline layout field: ${key}.`);
  const order = (key: string) => {
    const list = value[key] === undefined ? [] : value[key];
    if (
      !Array.isArray(list) ||
      !list.every((id) => typeof id === "string" && id.trim().length > 0) ||
      new Set(list).size !== list.length
    )
      throw new Error(`Invalid ${key}: use unique names or IDs.`);
    return [...list] as string[];
  };
  const plan: TimelineLayoutPlan = { trackOrder: order("trackOrder"), eventOrder: order("eventOrder") };
  if (value.edgeRouting !== undefined) {
    if (value.edgeRouting !== "avoid" && value.edgeRouting !== "direct") throw new Error("Invalid edge routing.");
    plan.edgeRouting = value.edgeRouting;
  }
  const point = (p: unknown): { x: number; y: number } => {
    if (
      !isRecord(p) ||
      Object.keys(p).some((k) => !["x", "y"].includes(k)) ||
      typeof p.x !== "number" ||
      typeof p.y !== "number" ||
      !Number.isFinite(p.x) ||
      !Number.isFinite(p.y)
    )
      throw new Error("Expected a finite x/y position.");
    return { x: p.x, y: p.y };
  };
  for (const key of ["placements", "routes"] as const) {
    if (value[key] === undefined) continue;
    const list = value[key];
    if (!Array.isArray(list)) throw new Error(`Invalid ${key}.`);
    const ids = new Set<string>();
    const items = list.map((item) => {
      if (
        !isRecord(item) ||
        typeof item.id !== "string" ||
        !item.id ||
        ids.has(item.id) ||
        Object.keys(item).some(
          (k) => !(key === "placements" ? ["id", "cross", "label"] : ["id", "points", "label"]).includes(k),
        )
      )
        throw new Error(`Invalid or duplicate ${key} ID.`);
      ids.add(item.id);
      const label = item.label === undefined ? {} : { label: point(item.label) };
      if (key === "placements") {
        if (typeof item.cross !== "number" || !Number.isFinite(item.cross)) throw new Error("Invalid cross position.");
        return { id: item.id, cross: item.cross, ...label };
      }
      if (!Array.isArray(item.points) || item.points.length < 2) throw new Error("A route needs at least two points.");
      return { id: item.id, points: item.points.map(point), ...label };
    });
    if (key === "placements") plan.placements = items as NonNullable<TimelineLayoutPlan["placements"]>;
    else plan.routes = items as NonNullable<TimelineLayoutPlan["routes"]>;
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
  for (const item of plan.placements ?? [])
    if (!Object.prototype.hasOwnProperty.call(doc.nodes, item.id))
      throw new Error(`Unknown timeline event: ${item.id}.`);
  for (const item of plan.routes ?? [])
    if (!doc.edges.some((edge) => edge.id === item.id)) throw new Error(`Unknown timeline relationship: ${item.id}.`);
  for (const track of plan.trackOrder) if (!tracks.has(track)) throw new Error(`Unknown timeline track: ${track}.`);
}
