import type { LayoutIntent,LayoutMetrics } from "./layout-plan";
import { compareLayoutMetrics } from "./layout-quality";

export interface LayoutFeedback {
  intent: LayoutIntent;
  baseline: LayoutMetrics;
  candidate: {
    id: string;
    metrics: LayoutMetrics;
    warnings: string[];
    movedNodeIds: string[];
    changedEdgeIds: string[];
  } | null;
  diagnostics: string[];
  retainedEarlierCandidate: boolean;
}

export function formatLayoutFeedback(feedback: LayoutFeedback): string {
  const { baseline, candidate, intent } = feedback;
  if (!candidate) return `No legal candidate found. The graph is unchanged. ${feedback.diagnostics.join(" ")}`;
  const improved = compareLayoutMetrics(candidate.metrics, baseline, intent.objective) < 0;
  const metric = (key: keyof LayoutMetrics) => `${Math.round(baseline[key])} → ${Math.round(candidate.metrics[key])}`;
  return [
    improved
      ? "Measured improvement; ready to compare."
      : "A legal candidate is available; the selected quality score did not improve.",
    `Crossings: ${metric("crossings")}. Shared route length: ${metric("sharedLength")} px. Bends: ${metric("bends")}.`,
    `${candidate.metrics.movedNodes} rectangles changed; ${candidate.changedEdgeIds.length} connections affected.`,
    feedback.retainedEarlierCandidate
      ? "The earlier candidate was retained because the refinement was not better."
      : "",
    ...candidate.warnings,
  ]
    .filter(Boolean)
    .join("\n");
}
