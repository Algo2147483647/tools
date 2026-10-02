import { parseConsoleSource } from "../console/dsl";
import { executeConsoleInstructions } from "../console/executor";
import { getNodeChildren, getNodeParents } from "../graph/accessors";
import { type GraphAppearance, DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { createGraphDocument } from "../graph/normalize";
import { getRelationKeys } from "../graph/relations";
import type { NodeKey, NormalizedDag } from "../graph/types";
import { classifyCommandRisk, isDestructiveCommand } from "./executionPolicy";
import { maxRisk } from "./harnessUtils";
import type { CommandBatch, ValidationReport } from "./types";

interface ValidateInput {
  batch: CommandBatch;
  dag: NormalizedDag | null;
  contextNodeKey: NodeKey | null;

  appearance?: GraphAppearance;
  graphRevision: string;
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

  const execution = executeConsoleInstructions(
    input.dag || createGraphDocument(),
    parsed.instructions,
    input.contextNodeKey,
    input.appearance || DEFAULT_GRAPH_APPEARANCE,
  );
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

  const diffPreview = [
    ...buildDiffPreview(input.dag || createGraphDocument(), execution.dag),
    ...execution.appearanceResults.flatMap((result) => result.diff),
  ];
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

function buildDiffPreview(beforeDag: NormalizedDag, afterDag: NormalizedDag): string[] {
  const beforeKeys = new Set(Object.keys(beforeDag.nodes));
  const afterKeys = new Set(Object.keys(afterDag.nodes));
  const lines: string[] = [];

  Array.from(afterKeys)
    .filter((key) => !beforeKeys.has(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => lines.push(`+ Node: ${key}`));

  Array.from(beforeKeys)
    .filter((key) => !afterKeys.has(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => lines.push(`- Node: ${key}`));

  Array.from(afterKeys)
    .filter((key) => beforeKeys.has(key))
    .sort((left, right) => left.localeCompare(right))
    .forEach((key) => {
      const beforeNode = beforeDag.nodes[key];
      const afterNode = afterDag.nodes[key];
      const beforeFields = Object.keys(beforeNode)
        .filter((field) => !isRelationField(field))
        .sort();
      const afterFields = Object.keys(afterNode)
        .filter((field) => !isRelationField(field))
        .sort();
      const allFields = Array.from(new Set([...beforeFields, ...afterFields])).sort();
      allFields.forEach((field) => {
        if (JSON.stringify(beforeNode[field]) !== JSON.stringify(afterNode[field])) {
          lines.push(`~ ${key}.${field}`);
        }
      });
    });

  diffEdges(beforeDag, afterDag, "children").forEach((line) => lines.push(line));

  return lines.slice(0, 24);
}

function diffEdges(beforeDag: NormalizedDag, afterDag: NormalizedDag, relation: "children" | "parents"): string[] {
  const lines: string[] = [];
  const keys = Array.from(new Set([...Object.keys(beforeDag.nodes), ...Object.keys(afterDag.nodes)])).sort();
  keys.forEach((key) => {
    const beforeNode = beforeDag.nodes[key];
    const afterNode = afterDag.nodes[key];
    const beforeRelations = beforeNode
      ? new Set(getRelationKeys(relation === "children" ? getNodeChildren(beforeNode) : getNodeParents(beforeNode)))
      : new Set<string>();
    const afterRelations = afterNode
      ? new Set(getRelationKeys(relation === "children" ? getNodeChildren(afterNode) : getNodeParents(afterNode)))
      : new Set<string>();
    Array.from(afterRelations)
      .filter((target) => !beforeRelations.has(target))
      .sort((left, right) => left.localeCompare(right))
      .forEach((target) => lines.push(`+ Edge: ${key} -> ${target}`));
    Array.from(beforeRelations)
      .filter((target) => !afterRelations.has(target))
      .sort((left, right) => left.localeCompare(right))
      .forEach((target) => lines.push(`- Edge: ${key} -> ${target}`));
  });
  return lines;
}

function isRelationField(field: string): boolean {
  return field === "parents" || field === "children";
}
