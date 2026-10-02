import { classifyCommandRisk, isDestructiveCommand } from "./executionPolicy";
import { createId, maxRisk } from "./harnessUtils";
import type { ActionPlan, AiHarnessState, AiResponse, CommandBatch, ProposedChange } from "./types";

interface PlanInput {
  response: Extract<AiResponse, { kind: "propose_changes" | "run_console" | "inspect" }>;
  harness: AiHarnessState;
  turnId: string;
  userMessage: string;
}

export function createPlanFromAiResponse(input: PlanInput): ActionPlan {
  const now = Date.now();
  const response = input.response;
  const commands = collectCommandsFromResponse(response);
  const riskLevel = maxRisk([
    response.kind === "run_console" ? response.commandBatch.riskLevel : undefined,
    ...collectChangesFromResponse(response).map((change) => change.risk),
    ...commands.map(classifyCommandRisk),
  ]);
  const batch: CommandBatch | undefined = commands.length
    ? {
        id: createId("batch"),
        status: "draft",
        title: getResponseTitle(response),
        commands,
        expectedGraphEffects: getExpectedGraphEffects(response),
        riskLevel,
        createdAt: now,
      }
    : undefined;

  const changes = collectChangesFromResponse(response);
  const title = getResponseTitle(response);
  const goal = response.kind === "propose_changes" ? response.plan.goal : response.answer;
  const affectedNodes =
    response.kind === "propose_changes" ? response.plan.affectedNodes || [] : extractMentionedNodes(commands);
  const planId = createId("plan");
  const commandBatch = batch ? { ...batch, planId } : undefined;

  return {
    id: planId,
    sessionId: input.harness.sessionId,
    graphId: input.harness.graphId,
    status: "proposed",
    title,
    goal,
    source: {
      userTurnId: input.turnId,
      createdFromMessage: input.userMessage,
    },
    scope: {
      targetNodes: affectedNodes,
      targetEdges: [],
      affectedConcepts: affectedNodes,
      graphRevisionBase: input.harness.graphRevision,
    },
    assumptions: response.kind === "propose_changes" ? response.plan.assumptions || [] : [],
    changes,
    commandBatch,
    ui: {
      displaySummary: buildPlanSummary(title, changes, commandBatch),
      requiresUserConfirmation: riskLevel !== "low" || Boolean(commandBatch?.commands.some(isDestructiveCommand)),
      riskLevel,
    },
    timestamps: {
      createdAt: now,
      updatedAt: now,
    },
  };
}

function collectCommandsFromResponse(
  response: Extract<AiResponse, { kind: "propose_changes" | "run_console" | "inspect" }>,
): string[] {
  if (response.kind === "run_console") {
    return response.commandBatch.commands;
  }
  if (response.kind === "inspect") {
    return response.commands;
  }
  const draftCommands = response.draftCommands?.map((draft) => draft.command) || [];
  const changeCommands = response.plan.changes.flatMap((change) => change.draftCommands);
  return dedupeCommands([...draftCommands, ...changeCommands]);
}

function collectChangesFromResponse(
  response: Extract<AiResponse, { kind: "propose_changes" | "run_console" | "inspect" }>,
): ProposedChange[] {
  if (response.kind === "propose_changes") {
    return response.plan.changes.map((change, index) => ({
      ...change,
      id: change.id || createId(`change-${index}`),
      dependencies: change.dependencies || [],
      risk: change.risk || maxRisk(change.draftCommands.map(classifyCommandRisk)),
    }));
  }
  const commands = response.kind === "run_console" ? response.commandBatch.commands : response.commands;
  return commands.map((command, index) => ({
    id: createId(`change-${index}`),
    kind: inferChangeKind(command),
    rationale: response.answer,
    draftCommands: [command],
    dependencies: [],
    risk: classifyCommandRisk(command),
  }));
}

function getResponseTitle(
  response: Extract<AiResponse, { kind: "propose_changes" | "run_console" | "inspect" }>,
): string {
  if (response.kind === "propose_changes") {
    return response.plan.title;
  }
  if (response.kind === "run_console") {
    return response.commandBatch.title || "AI command batch";
  }
  return "AI inspection commands";
}

function getExpectedGraphEffects(
  response: Extract<AiResponse, { kind: "propose_changes" | "run_console" | "inspect" }>,
): string[] {
  if (response.kind === "propose_changes") {
    return collectChangeRationales(response.plan.changes);
  }
  if (response.kind === "run_console") {
    return response.commandBatch.expectedGraphEffects || [];
  }
  return ["Inspect graph state with read-only commands."];
}

function collectChangeRationales(changes: ProposedChange[]): string[] {
  return changes.map((change) => change.rationale).filter(Boolean);
}

function dedupeCommands(commands: string[]): string[] {
  const seen = new Set<string>();
  return commands
    .map((command) => command.trim())
    .filter((command) => {
      if (!command || !command.startsWith("/") || seen.has(command)) {
        return false;
      }
      seen.add(command);
      return true;
    });
}

function inferChangeKind(command: string): ProposedChange["kind"] {
  const normalized = command.trim().toLowerCase();
  if (normalized.startsWith("/add ")) return "add_node";
  if (normalized.startsWith("/edge ")) return "add_edge";
  if (normalized.startsWith("/rm-edge ")) return "remove_edge";
  if (normalized.startsWith("/mv ")) return "rename_node";
  if (normalized.startsWith("/rm ")) return "remove_edge";
  if (normalized.startsWith("/style-") || normalized.startsWith("/layout ")) return "set_property";
  return "set_property";
}

function extractMentionedNodes(commands: string[]): string[] {
  const candidates = commands.flatMap((command) => command.split(/\s+/).slice(1, 4));
  return Array.from(new Set(candidates.filter((item) => item && !item.startsWith("-") && !item.includes("="))));
}

function buildPlanSummary(title: string, changes: ProposedChange[], batch: CommandBatch | undefined): string {
  return `${title}: ${changes.length} proposed change${changes.length === 1 ? "" : "s"}, ${batch?.commands.length || 0} command${batch?.commands.length === 1 ? "" : "s"}.`;
}
