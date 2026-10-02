import type { AiExecutionMode, ValidationReport } from "./types";

export function referencesPreviousWork(message: string): boolean {
  const normalized = message.toLocaleLowerCase();
  return [
    "previous",
    "just now",
    "above",
    "as you said",
    "based on your",
    "apply it",
    "do it",
    "continue",
    "complete",
  ].some((phrase) => normalized.includes(phrase));
}

export function formatValidationReport(validation: ValidationReport): string {
  const failed = validation.results.filter((result) => !result.valid);
  const warnings = validation.results.flatMap((result) =>
    result.warnings.map((warning) => `${result.command}: ${warning}`),
  );
  return [
    `Preflight: ${validation.allPassed ? "passed" : "failed"}`,
    validation.summary,
    warnings.length ? `Warnings:\n${warnings.map((warning) => `- ${warning}`).join("\n")}` : "",
    failed.length
      ? `Errors:\n${failed.map((result) => `- ${result.command}: ${result.errors.join("; ")}`).join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function formatReviewInstruction(mode: AiExecutionMode): string {
  if (mode === "ask") {
    return 'Ask mode: commands are saved as a pending plan. Type "apply it" after switching to Review or Auto Edit, or copy the commands to run them manually.';
  }
  if (mode === "review") {
    return 'Review mode: preflight passed. Type "apply it" to execute the pending command batch.';
  }
  return "Auto Edit mode: command batch is ready.";
}
