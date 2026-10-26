import { getDomainCommand } from "../../console/domainRegistry";
import { type ConsoleInstruction, parseConsoleSource } from "../../console/dsl";
import type { AiRiskLevel, ValidationReport } from "../types";

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
        instruction.type === "delete" ||
        instruction.type === "removeEdge" ||
        instruction.type === "unsetField" ||
        (instruction.type === "domain" && ["delete", "dissolve"].includes(instruction.action)),
    )
  );
}

export function shouldExecuteValidatedBatch(validation: ValidationReport): boolean {
  return validation.allPassed && validation.results.length > 0 && validation.results.every((result) => result.valid);
}

function classifyInstructionRisk(instruction: ConsoleInstruction): AiRiskLevel {
  switch (instruction.type) {
    case "domain":
      return ["delete", "dissolve"].includes(instruction.action)
        ? "high"
        : getDomainCommand(instruction.family, instruction.action).effect === "query"
          ? "low"
          : "medium";
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
