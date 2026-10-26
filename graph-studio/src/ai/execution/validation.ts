import { isReadOnlyInstruction } from "../../console/presentation";
import { parseConsoleSource } from "../../console/dsl";
import { executeConsoleInstructions } from "../../console/executor";
import { type GraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../../schema/appearance/defaults";
import { createGraphDocument } from "../../graph/normalize";
import type { GraphChartType, NodeKey, NormalizedDag } from "../../graph/types";
import type { CommandBatch, ValidationReport } from "../types";
import { classifyCommandRisk, isDestructiveCommand } from "./policy";
import { maxRisk } from "./risk";

interface ValidateInput {
  prepared?: import("../../console/execution/types").ConsoleRunResult;
  environment?: import("../../console/runtime").ConsoleEnvironment;
  readOnly?: boolean;
  batch: CommandBatch;
  dag: NormalizedDag | null;
  contextNodeKey: NodeKey | null;

  appearance?: GraphAppearance;
  graphRevision: string;
  chartType: GraphChartType;
}

export function validateCommandBatch(input: ValidateInput): ValidationReport {
  const reportBase = {
    commandBatchId: input.batch.id,
    graphRevisionBase: input.graphRevision,
    riskLevel: input.batch.riskLevel,
  };

  if (!input.batch.commands.length) {
    return {
      ...reportBase,
      results: [],
      allPassed: false,
      requiresConfirmation: true,
      summary: "No commands were provided.",
    };
  }

  const source = input.batch.commands.join("\n");
  const parsed = parseConsoleSource(source);
  if (!parsed.ok) {
    return {
      ...reportBase,
      results: input.batch.commands.map((command, index) => ({
        command,
        valid: index + 1 !== parsed.error.line,
        errors: index + 1 === parsed.error.line ? [parsed.error.message] : [],
        warnings: [],
      })),
      allPassed: false,
      riskLevel: maxRisk([input.batch.riskLevel, ...input.batch.commands.map(classifyCommandRisk)]),
      requiresConfirmation: true,
      summary: `Command syntax failed on line ${parsed.error.line}: ${parsed.error.message}`,
    };
  }

  if (
    !input.dag &&
    parsed.instructions.some(
      (instruction) => !["help", "clear", "appearance", "appearanceCssShow"].includes(instruction.type),
    )
  ) {
    return {
      ...reportBase,
      results: input.batch.commands.map((command) => ({
        command,
        valid: false,
        errors: ["No graph is loaded."],
        warnings: [],
      })),
      allPassed: false,
      requiresConfirmation: true,
      summary: "No graph is loaded.",
    };
  }

  const execution =
    input.readOnly && parsed.instructions.some((i) => !isReadOnlyInstruction(i))
      ? {
          ok: false as const,
          line: 1,
          message: "Inspection only permits read-only queries.",
          contextNodeKey: input.contextNodeKey,
        }
      : (input.prepared ??
        executeConsoleInstructions(
          input.dag || createGraphDocument(),
          parsed.instructions,
          input.contextNodeKey,
          input.appearance || DEFAULT_GRAPH_APPEARANCE,
          input.chartType,
          input.environment,
        ));
  const commandRisks = input.batch.commands.map(classifyCommandRisk);
  const riskLevel = maxRisk([input.batch.riskLevel, ...commandRisks]);
  const destructive = input.batch.commands.some(isDestructiveCommand);

  if (!execution.ok) {
    return {
      ...reportBase,
      results: input.batch.commands.map((command, index) => ({
        command,
        valid: index + 1 !== execution.line,
        errors: index + 1 === execution.line ? [execution.message] : [],
        warnings: buildCommandWarnings(command),
      })),
      allPassed: false,
      riskLevel,
      requiresConfirmation: true,
      summary: `Command validation failed on line ${execution.line}: ${execution.message}`,
    };
  }

  const diffPreview = execution.diff;
  const mutationSummary = diffPreview.length ? diffPreview : ["No graph mutations expected."];
  return {
    ...reportBase,
    results: input.batch.commands.map((command, index) => ({
      command,
      valid: true,
      errors: [],
      warnings: buildCommandWarnings(command),
      expectedDiff: index === 0 ? mutationSummary : undefined,
    })),
    allPassed: true,
    riskLevel,
    requiresConfirmation: destructive || riskLevel === "high" || execution.mutationCount > 0,
    summary: [
      `Preflight passed for ${execution.instructionCount} command${execution.instructionCount === 1 ? "" : "s"}.`,
      ...mutationSummary,
      `Risk: ${riskLevel}.`,
    ].join(" "),
  };
}

function buildCommandWarnings(command: string): string[] {
  const normalized = command.trim().toLowerCase();
  const warnings: string[] = [];
  if (normalized.startsWith("/set ") && normalized.includes(" define ")) {
    warnings.push("definition field will be overwritten");
  }
  if (normalized.startsWith("/parents ") || normalized.startsWith("/children ")) {
    warnings.push("relation set replacement can remove existing edges");
  }
  if (isDestructiveCommand(command)) {
    warnings.push("destructive command requires review");
  }
  if (normalized.startsWith("/style-css replace")) {
    warnings.push("custom CSS will replace the current graph appearance stylesheet");
  }
  return warnings;
}
