import { type ConsoleInstruction, parseConsoleSource } from "../console/dsl";
import type { AiExecutionMode, AiRiskLevel, ValidationReport } from "./types";

export function normalizeAiExecutionMode(value: unknown, fallback: AiExecutionMode = "ask"): AiExecutionMode {
  if (value === undefined || value === null) return fallback;
  return value === "ask" || value === "review" || value === "auto-edit" ? value : "ask";
}

export function classifyCommandRisk(source: string): AiRiskLevel {
  const parsed = parseConsoleSource(source);
  if (!parsed.ok || !parsed.instructions.length) return "high";
  const risks = parsed.instructions.map(classifyInstructionRisk);
  return risks.includes("high") ? "high" : risks.includes("medium") ? "medium" : "low";
}

export function isDestructiveCommand(source: string): boolean {
  const parsed = parseConsoleSource(source);
  return (
    !parsed.ok ||
    parsed.instructions.some(
      (instruction) =>
        instruction.type === "delete" || instruction.type === "removeEdge" || instruction.type === "unsetField",
    )
  );
}

export function shouldExecuteValidatedBatch(mode: AiExecutionMode, validation: ValidationReport): boolean {
  return (
    mode === "auto-edit" &&
    validation.allPassed &&
    validation.results.length > 0 &&
    validation.riskLevel !== "high" &&
    validation.results.every((result) => result.valid && !isDestructiveCommand(result.command))
  );
}

function classifyInstructionRisk(instruction: ConsoleInstruction): AiRiskLevel {
  switch (instruction.type) {
    case "delete":
    case "removeEdge":
    case "unsetField":
    case "setParents":
    case "setChildren":
      return "high";
    case "add":
    case "copy":
    case "rename":
    case "setField":
    case "setEdge":
      return "medium";
    case "appearance":
      return instruction.command.type === "resetAppearance" || instruction.command.type === "replaceCss"
        ? "medium"
        : "low";
    default:
      return "low";
  }
}
