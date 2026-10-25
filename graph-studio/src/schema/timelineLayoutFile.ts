import { parseTimelineLayoutPlan, type TimelineLayoutPlan } from "../graph/timeline/layoutData";
import { isRecord } from "../shared/json";

/** File vectors are tuples; the independent AI/solver protocol keeps named point coordinates. */
export function timelinePlanToFile(plan: TimelineLayoutPlan) {
  return {
    ...plan,
    ...(plan.placements
      ? {
          placements: plan.placements.map(({ label, ...placement }) => ({
            ...placement,
            ...(label ? { label: [label.x, label.y] } : {}),
          })),
        }
      : {}),
    ...(plan.routes
      ? {
          routes: plan.routes.map(({ points, label, ...route }) => ({
            ...route,
            points: points.map((p) => [p.x, p.y]),
            ...(label ? { label: [label.x, label.y] } : {}),
          })),
        }
      : {}),
  };
}

export function timelinePlanFromFile(value: unknown): TimelineLayoutPlan {
  if (!isRecord(value)) throw new Error("Invalid timeline layout plan.");
  const point = (v: unknown) => {
    if (!Array.isArray(v) || v.length !== 2 || !v.every((n) => typeof n === "number" && Number.isFinite(n)))
      throw new Error("Layout coordinates must be [x, y] with two finite numbers.");
    return { x: v[0] as number, y: v[1] as number };
  };
  const entries = (v: unknown) => {
    if (!Array.isArray(v) || !v.every(isRecord)) throw new Error("Invalid timeline layout entries.");
    return v as Record<string, unknown>[];
  };
  return parseTimelineLayoutPlan({
    ...value,
    ...(value.placements !== undefined
      ? {
          placements: entries(value.placements).map(({ label, ...p }) => ({
            ...p,
            ...(label !== undefined ? { label: point(label) } : {}),
          })),
        }
      : {}),
    ...(value.routes !== undefined
      ? {
          routes: entries(value.routes).map(({ points, label, ...r }) => {
            if (!Array.isArray(points)) throw new Error("Layout routes need an array of [x, y] waypoints.");
            return { ...r, points: points.map(point), ...(label !== undefined ? { label: point(label) } : {}) };
          }),
        }
      : {}),
  });
}
