import type { AiResponse, LegacyAiPlan, ProposedChange } from "./types";
export function parseAiResponse(raw: string): AiResponse {
  const jsonSource = extractJsonObject(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonSource) as unknown;
  } catch (error) {
    throw new Error(formatJsonParseError(error, jsonSource));
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("AI response was not a JSON object.");
  }
  const record = parsed as Record<string, unknown>;

  if (record.kind === "answer" && typeof record.answer === "string") {
    return { kind: "answer", answer: record.answer };
  }

  if (record.kind === "clarify" && typeof record.answer === "string") {
    const missingInformation = Array.isArray(record.missingInformation)
      ? record.missingInformation
          .map((item) => normalizeMissingInformation(item))
          .filter((item): item is { field: string; reason: string; candidates?: string[] } => Boolean(item))
      : undefined;
    return { kind: "clarify", answer: record.answer, missingInformation };
  }

  if (record.kind === "inspect" && typeof record.answer === "string" && Array.isArray(record.commands)) {
    return {
      kind: "inspect",
      answer: record.answer,
      commands: record.commands.map((command) => String(command).trim()).filter((command) => command.startsWith("/")),
    };
  }

  if (record.kind === "run_console" && typeof record.answer === "string" && isRecord(record.commandBatch)) {
    const commands = Array.isArray(record.commandBatch.commands)
      ? record.commandBatch.commands
          .map((command) => String(command).trim())
          .filter((command) => command.startsWith("/"))
      : [];
    if (!commands.length) {
      throw new Error("AI run_console response did not include commands.");
    }
    return {
      kind: "run_console",
      answer: record.answer,
      commandBatch: {
        title: typeof record.commandBatch.title === "string" ? record.commandBatch.title : undefined,
        commands,
        expectedGraphEffects: Array.isArray(record.commandBatch.expectedGraphEffects)
          ? record.commandBatch.expectedGraphEffects.map((effect) => String(effect))
          : undefined,
        riskLevel: normalizeRisk(record.commandBatch.riskLevel),
      },
      preflightRequired: record.preflightRequired !== false,
    };
  }

  if (
    record.kind === "propose_changes" &&
    typeof record.answer === "string" &&
    isRecord(record.plan) &&
    typeof record.plan.title === "string" &&
    typeof record.plan.goal === "string" &&
    Array.isArray(record.plan.changes)
  ) {
    return {
      kind: "propose_changes",
      answer: record.answer,
      plan: {
        title: record.plan.title,
        goal: record.plan.goal,
        assumptions: Array.isArray(record.plan.assumptions) ? record.plan.assumptions.map((item) => String(item)) : [],
        affectedNodes: Array.isArray(record.plan.affectedNodes)
          ? record.plan.affectedNodes.map((item) => String(item))
          : [],
        changes: record.plan.changes
          .map((item) => normalizeProposedChange(item))
          .filter((item): item is ProposedChange => Boolean(item)),
      },
      draftCommands: normalizeDraftCommands(record.draftCommands),
      nextAction:
        isRecord(record.nextAction) &&
        typeof record.nextAction.type === "string" &&
        typeof record.nextAction.message === "string"
          ? {
              type: normalizeNextAction(record.nextAction.type),
              message: record.nextAction.message,
            }
          : undefined,
    };
  }

  const legacy = parseLegacyAiPlan(record);
  if (legacy.type === "answer") {
    return { kind: "answer", answer: legacy.text };
  }
  return {
    kind: "run_console",
    answer: legacy.explanation,
    commandBatch: {
      commands: legacy.commands,
      riskLevel: "medium",
    },
    preflightRequired: true,
  };
}

function normalizeDraftCommands(
  value: unknown,
): Array<{ command: string; rationale?: string; risk?: "low" | "medium" | "high" }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const commands: Array<{ command: string; rationale?: string; risk?: "low" | "medium" | "high" }> = [];
  value.forEach((item) => {
    if (!isRecord(item) || typeof item.command !== "string") {
      return;
    }
    commands.push({
      command: item.command,
      rationale: typeof item.rationale === "string" ? item.rationale : undefined,
      risk: normalizeRisk(item.risk),
    });
  });
  return commands;
}

function parseLegacyAiPlan(record: Record<string, unknown>): LegacyAiPlan {
  if (record.type === "answer" && typeof record.text === "string") {
    return { type: "answer", text: record.text };
  }
  if (
    record.type === "run_console" &&
    typeof record.explanation === "string" &&
    Array.isArray(record.commands) &&
    record.commands.every((command) => typeof command === "string" && command.trim().startsWith("/"))
  ) {
    return {
      type: "run_console",
      explanation: record.explanation,
      commands: record.commands.map((command) => command.trim()).filter(Boolean),
    };
  }
  throw new Error("AI response did not match the expected response protocol.");
}

function normalizeProposedChange(value: unknown): ProposedChange | null {
  if (
    !isRecord(value) ||
    typeof value.kind !== "string" ||
    typeof value.rationale !== "string" ||
    !Array.isArray(value.draftCommands)
  ) {
    return null;
  }
  const allowedKinds = new Set([
    "add_node",
    "set_property",
    "add_edge",
    "remove_edge",
    "merge_node",
    "rename_node",
    "restructure_subgraph",
  ]);
  if (!allowedKinds.has(value.kind)) {
    return null;
  }
  return {
    id: typeof value.id === "string" ? value.id : undefined,
    kind: value.kind as ProposedChange["kind"],
    target: normalizeTarget(value.target),
    rationale: value.rationale,
    draftCommands: value.draftCommands
      .map((command) => String(command).trim())
      .filter((command) => command.startsWith("/")),
    dependencies: Array.isArray(value.dependencies) ? value.dependencies.map((item) => String(item)) : undefined,
    risk: normalizeRisk(value.risk),
  };
}

function normalizeTarget(value: unknown): ProposedChange["target"] | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  return {
    nodeId: typeof value.nodeId === "string" ? value.nodeId : undefined,
    edgeId: typeof value.edgeId === "string" ? value.edgeId : undefined,
    property: typeof value.property === "string" ? value.property : undefined,
  };
}

function normalizeMissingInformation(value: unknown): { field: string; reason: string; candidates?: string[] } | null {
  if (!isRecord(value) || typeof value.field !== "string" || typeof value.reason !== "string") {
    return null;
  }
  return {
    field: value.field,
    reason: value.reason,
    candidates: Array.isArray(value.candidates) ? value.candidates.map((item) => String(item)) : undefined,
  };
}

function normalizeRisk(value: unknown): "low" | "medium" | "high" | undefined {
  return value === "low" || value === "medium" || value === "high" ? value : undefined;
}

function normalizeNextAction(value: string): "await_user_confirmation" | "validate_then_execute" | "needs_inspection" {
  return value === "validate_then_execute" || value === "needs_inspection" ? value : "await_user_confirmation";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractJsonObject(raw: string): string {
  const trimmed = stripJsonFence(raw.trim());
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed;
  }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return trimmed.slice(start, end + 1);
  }
  throw new Error("AI response did not contain JSON.");
}

function stripJsonFence(value: string): string {
  const fenceMatch = value.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenceMatch ? fenceMatch[1].trim() : value;
}

function formatJsonParseError(error: unknown, source: string): string {
  const nativeMessage = error instanceof Error ? error.message : "Invalid JSON.";
  const position = extractJsonErrorPosition(nativeMessage);
  const location = position === null ? "" : ` near ${formatJsonLocation(source, position)}`;
  const snippet = position === null ? "" : ` Snippet: ${JSON.stringify(buildJsonErrorSnippet(source, position))}`;
  return [
    `AI response contained invalid JSON${location}: ${nativeMessage}.`,
    'Command strings must escape nested double quotes, for example: /set Water define \\"2H2 + O2 -> 2H2O\\".',
    snippet,
  ]
    .filter(Boolean)
    .join(" ");
}

function extractJsonErrorPosition(message: string): number | null {
  const match = message.match(/position\s+(\d+)/i);
  if (!match) {
    return null;
  }
  const position = Number(match[1]);
  return Number.isInteger(position) && position >= 0 ? position : null;
}

function formatJsonLocation(source: string, position: number): string {
  const before = source.slice(0, position);
  const line = before.split(/\r?\n/).length;
  const lastLineBreak = Math.max(before.lastIndexOf("\n"), before.lastIndexOf("\r"));
  const column = position - lastLineBreak;
  return `line ${line}, column ${column}`;
}

function buildJsonErrorSnippet(source: string, position: number): string {
  const start = Math.max(0, position - 80);
  const end = Math.min(source.length, position + 80);
  return source.slice(start, end).replace(/\s+/g, " ").trim();
}
