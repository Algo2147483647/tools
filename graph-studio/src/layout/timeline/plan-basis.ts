import { graphLayoutIdentity, layoutIdentity } from "../../schema/layoutGeometry";
import type { TimelineLayoutInput } from "./input-types";

/** Exact positions/routes belong to the graph, time mapping and measured dimensions that produced them. */
export function timelinePlanBasis(input: TimelineLayoutInput) {
  const { fontMetricsKey: _fontMetricsKey, ...appearance } = input.appearance ?? {};
  return layoutIdentity({
    graph: graphLayoutIdentity(input.dag),
    appearance,
    settings: input.timelineSettings,
    showNodeDetail: input.showNodeDetail ?? false,
    range: input.timeRange ?? null,
  });
}
