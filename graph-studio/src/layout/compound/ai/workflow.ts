import type { AiSettings } from "../../../ai/types";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { CompoundLayoutData, LayoutProblem } from "../layout-plan";
import { routingHotspots } from "../diagnostics";
import { compareLayoutMetrics } from "../layout-quality";
import { applyCompoundAiPlan } from "./protocol";
import { compoundAiContext, requestCompoundLayout } from "./request";

export function compoundExecutionFeedback(before: LayoutProblem, stage: StageData) {
  const problem = stage.compoundLayout!;
  const hotspots = routingHotspots(problem);
  const metrics = stage.layoutQuality!.metrics;
  const boxes = Object.values(problem.baseline.boxes);
  const contentBottom = Math.max(0, ...boxes.map((b) => b.y + b.height));
  const routeBottom = Math.max(
    0,
    ...Object.values(problem.baseline.routes).flatMap((route) => route.points.map((p) => p.y)),
  );
  const excessiveDetours = hotspots.detours.filter((d) => d.ratio > 4 && d.length > d.directDistance + 160);
  const previous = compoundAiContext(before).context.quality;
  const needsRevision =
    stage.warnings.length > 0 ||
    excessiveDetours.length > 0 ||
    metrics.length > Math.max(previous.length * 1.25, previous.length + 240) ||
    routeBottom > Math.max(contentBottom * 1.5, contentBottom + 240);
  return {
    needsRevision,
    before: previous,
    after: metrics,
    diagnostics: stage.warnings,
    excessiveDetours,
    canvas: { width: problem.baseline.width, height: problem.baseline.height, contentBottom, routeBottom },
  };
}

/** At most two plans and two solves. Only the final chosen declaration/stage is committed. */
export async function runCompoundAiLayout(options: {
  settings: AiSettings;
  problem: LayoutProblem;
  message: string;
  signal: AbortSignal;
  compute(data: CompoundLayoutData): Promise<StageData>;
  onStatus?(message: string): void;
}) {
  const { problem, signal } = options;
  const replacement = compoundAiContext(problem);
  const checkCancelled = () => {
    if (signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
  };
  const onRetry = () => options.onStatus?.("Correcting the layout response…");
  let plan = await requestCompoundLayout(options.settings, problem, options.message, signal, onRetry);
  checkCancelled();
  const firstData = applyCompoundAiPlan(problem.stored, plan, problem.projection.focusGroupId, replacement);
  let first: StageData | undefined;
  let feedback: unknown;
  try {
    options.onStatus?.("Arranging…");
    first = await options.compute(firstData);
    checkCancelled();
    const result = compoundExecutionFeedback(problem, first);
    if (!result.needsRevision) return { data: firstData, stage: first };
    feedback = result;
  } catch (error) {
    checkCancelled();
    feedback = { solveError: error instanceof Error ? error.message.slice(0, 1000) : "Layout solve failed." };
  }
  options.onStatus?.("Refining the layout from routing results…");
  try {
    plan = await requestCompoundLayout(
      options.settings,
      first?.compoundLayout ?? problem,
      options.message,
      signal,
      onRetry,
      { selectedDirection: problem.stored.direction, feedback: { previousPlan: plan, result: feedback } },
    );
    checkCancelled();
    // Always replace against the original scope, so a revision can retract its first plan.
    const data = applyCompoundAiPlan(problem.stored, plan, problem.projection.focusGroupId, replacement);
    if (first && JSON.stringify(data) === JSON.stringify(firstData)) return { data: firstData, stage: first };
    options.onStatus?.("Arranging revised plan…");
    const stage = await options.compute(data);
    checkCancelled();
    if (
      !first ||
      stage.warnings.length < first.warnings.length ||
      (stage.warnings.length === first.warnings.length &&
        compareLayoutMetrics(stage.layoutQuality!.metrics, first.layoutQuality!.metrics, data.objective) <= 0)
    )
      return { data, stage };
    return {
      data: firstData,
      stage: {
        ...first,
        warnings: [...first.warnings, "The refinement did not improve the layout; the first computed plan was used."],
      },
    };
  } catch (error) {
    checkCancelled();
    if (!first) throw error;
    return {
      data: firstData,
      stage: {
        ...first,
        warnings: [...first.warnings, "The refinement could not complete; the first computed plan was used."],
      },
    };
  }
}
