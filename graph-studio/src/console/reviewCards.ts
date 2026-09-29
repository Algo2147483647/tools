import type { ActionPlan, ValidationReport } from "../ai/types";
import type { ConsoleReviewCard } from "./types";

export function buildConsoleReviewCard(
  plan: ActionPlan,
  validation: ValidationReport,
  statusOverride?: ConsoleReviewCard["status"],
): ConsoleReviewCard {
  const commands = plan.commandBatch?.commands || [];
  const diffPreview = validation.results.flatMap((result) => result.expectedDiff || []);
  return {
    planId: plan.id,
    title: plan.title,
    goal: plan.goal,
    riskLevel: validation.riskLevel,
    status: statusOverride || (validation.allPassed ? "ready" : "failed"),
    commandCount: commands.length,
    changeCount: plan.changes.length,
    commands,
    diffPreview,
    validationSummary: validation.summary,
    canApply: validation.allPassed && commands.length > 0 && !statusOverride,
  };
}
