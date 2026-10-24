import { resolveAppearance } from "./appearanceContract";
import type { GraphAppearance } from "./appearanceModel";
export type { GraphAppearance, GraphGeometryAppearance } from "./appearanceModel";

export const DEFAULT_GRAPH_APPEARANCE: GraphAppearance = resolveAppearance(undefined);

export function sanitizeGraphAppearance(input: unknown): GraphAppearance {
  return resolveAppearance(input ?? undefined);
}
