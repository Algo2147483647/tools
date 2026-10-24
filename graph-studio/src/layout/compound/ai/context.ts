import type { LayoutIntent } from "../layout-plan";

export function buildCompoundLayoutContext(
  defaultIntent: LayoutIntent,
  inspection: object,
  pending: { intent: LayoutIntent; candidateIds: string[] } | null,
) {
  return { protocolVersion: 1, defaultIntent, ...inspection,
    supportedConstraints: ["direction", "pin", "unpin", "prefer-outer-route", "port-side"], pending };
}
