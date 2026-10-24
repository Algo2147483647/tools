import { resolveAppearance } from "./contract";
import type { GraphAppearance } from "./types";
export type { GraphAppearance, GraphGeometryAppearance } from "./types";

export const DEFAULT_GRAPH_APPEARANCE: GraphAppearance = resolveAppearance(undefined);

export function sanitizeGraphAppearance(input: unknown): GraphAppearance {
  return resolveAppearance(input ?? undefined);
}
