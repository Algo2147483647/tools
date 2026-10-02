import { createId, MAX_RECENT_EVENTS } from "./harnessUtils";
import type { ActionPlan, AiEvent, AiExecutionMode, AiHarnessState, ValidationReport, WorkingMemory } from "./types";

export function createInitialAiHarnessState(mode: AiExecutionMode): AiHarnessState {
  const sessionId = createId("session");
  return {
    sessionId,
    graphId: "local-graph",
    graphRevision: "0",
    workingMemory: createEmptyWorkingMemory(),
    recentEvents: [],
    artifactRefs: {},
    mode,
  };
}

export function createTurnId(): string {
  return createId("turn");
}

export function syncHarnessRuntime(
  harness: AiHarnessState,
  input: { graphId: string; graphRevision: string; mode: AiExecutionMode },
): AiHarnessState {
  const activePlan =
    harness.activePlan &&
    isOpenPlanStatus(harness.activePlan.status) &&
    (harness.activePlan.scope.graphRevisionBase !== input.graphRevision || harness.activePlan.graphId !== input.graphId)
      ? {
          ...harness.activePlan,
          status: "superseded" as const,
          timestamps: { ...harness.activePlan.timestamps, updatedAt: Date.now() },
        }
      : harness.activePlan;
  const pendingCommandBatch =
    harness.graphId !== input.graphId ||
    harness.graphRevision !== input.graphRevision ||
    activePlan?.status === "superseded"
      ? undefined
      : harness.pendingCommandBatch;
  return {
    ...harness,
    graphId: input.graphId,
    graphRevision: input.graphRevision,
    mode: input.mode,
    activePlan,
    pendingCommandBatch,
    workingMemory: {
      ...harness.workingMemory,
      activePlanId: activePlan?.status === "superseded" ? undefined : activePlan?.id,
      pendingCommandBatchId: pendingCommandBatch?.id,
    },
  };
}

function isOpenPlanStatus(status: ActionPlan["status"]): boolean {
  return (
    status === "draft" ||
    status === "proposed" ||
    status === "approved" ||
    status === "validating" ||
    status === "ready" ||
    status === "executing" ||
    status === "failed"
  );
}

export function appendAiEvents(harness: AiHarnessState, events: AiEvent[]): AiHarnessState {
  return {
    ...harness,
    recentEvents: [...harness.recentEvents, ...events].slice(-MAX_RECENT_EVENTS),
  };
}

export function createAiEvent(
  harness: AiHarnessState,
  turnId: string,
  type: AiEvent["type"],
  payload: Record<string, unknown>,
  causality?: AiEvent["causality"],
): AiEvent {
  return {
    id: createId("event"),
    sessionId: harness.sessionId,
    turnId,
    type,
    timestamp: Date.now(),
    graphRevisionBefore: harness.graphRevision,
    payload,
    causality,
  };
}

export function installPlan(harness: AiHarnessState, plan: ActionPlan, turnId: string): AiHarnessState {
  const planEvent = createAiEvent(harness, turnId, "plan.created", {
    planId: plan.id,
    title: plan.title,
    goal: plan.goal,
    commandCount: plan.commandBatch?.commands.length || 0,
    riskLevel: plan.ui.riskLevel,
  });
  const commandEvent = plan.commandBatch
    ? createAiEvent(
        harness,
        turnId,
        "command.drafted",
        {
          planId: plan.id,
          commandBatchId: plan.commandBatch.id,
          commands: plan.commandBatch.commands,
        },
        { parentEventIds: [planEvent.id], sourcePlanId: plan.id, sourceCommandBatchId: plan.commandBatch.id },
      )
    : null;

  return {
    ...appendAiEvents(harness, commandEvent ? [planEvent, commandEvent] : [planEvent]),
    activePlan: plan,
    pendingCommandBatch: plan.commandBatch,
    workingMemory: {
      ...harness.workingMemory,
      activeTopic: plan.title,
      activePlanId: plan.id,
      pendingCommandBatchId: plan.commandBatch?.id,
      focus: {
        ...harness.workingMemory.focus,
        nodeIds: plan.scope.targetNodes,
        concepts: plan.scope.affectedConcepts,
      },
      currentIntent: {
        type: plan.commandBatch ? "modify_graph" : "analyze_graph",
        confidence: 0.86,
        sourceUserMessage: plan.source.createdFromMessage,
      },
    },
  };
}

export function attachValidationToHarness(
  harness: AiHarnessState,
  validation: ValidationReport,
  turnId: string,
): AiHarnessState {
  const pending = harness.pendingCommandBatch
    ? {
        ...harness.pendingCommandBatch,
        status: validation.allPassed ? ("validated" as const) : ("failed" as const),
        validation,
        riskLevel: validation.riskLevel,
      }
    : undefined;
  const activePlan = harness.activePlan
    ? {
        ...harness.activePlan,
        status: validation.allPassed ? ("ready" as const) : ("failed" as const),
        commandBatch: pending,
        validation,
        timestamps: { ...harness.activePlan.timestamps, updatedAt: Date.now() },
      }
    : undefined;
  const event = createAiEvent(
    harness,
    turnId,
    "command.validated",
    {
      commandBatchId: validation.commandBatchId,
      allPassed: validation.allPassed,
      riskLevel: validation.riskLevel,
      summary: validation.summary,
    },
    pending ? { parentEventIds: [], sourcePlanId: pending.planId, sourceCommandBatchId: pending.id } : undefined,
  );

  return {
    ...appendAiEvents(harness, [event]),
    activePlan,
    pendingCommandBatch: pending,
    artifactRefs: {
      ...harness.artifactRefs,
      lastValidation: validation.commandBatchId,
    },
    workingMemory: {
      ...harness.workingMemory,
      activePlanId: activePlan?.id,
      pendingCommandBatchId: pending?.id,
    },
  };
}

export function markPendingBatchExecuted(harness: AiHarnessState, turnId: string): AiHarnessState {
  const pending = harness.pendingCommandBatch
    ? { ...harness.pendingCommandBatch, status: "executed" as const, executedAt: Date.now() }
    : undefined;
  const activePlan = harness.activePlan
    ? {
        ...harness.activePlan,
        status: "applied" as const,
        commandBatch: pending,
        timestamps: { ...harness.activePlan.timestamps, updatedAt: Date.now() },
      }
    : undefined;
  const event = createAiEvent(
    harness,
    turnId,
    "command.executed",
    {
      commandBatchId: pending?.id,
      planId: activePlan?.id,
      commandCount: pending?.commands.length || 0,
    },
    pending ? { parentEventIds: [], sourcePlanId: pending.planId, sourceCommandBatchId: pending.id } : undefined,
  );

  return {
    ...appendAiEvents(harness, [event]),
    activePlan,
    pendingCommandBatch: undefined,
    workingMemory: {
      ...harness.workingMemory,
      activePlanId: activePlan?.id,
      pendingCommandBatchId: undefined,
      currentIntent: activePlan
        ? {
            type: "execute_pending_commands",
            confidence: 1,
            sourceUserMessage: activePlan.source.createdFromMessage,
          }
        : harness.workingMemory.currentIntent,
    },
  };
}

function createEmptyWorkingMemory(): WorkingMemory {
  return {
    focus: {
      nodeIds: [],
      edgeIds: [],
      concepts: [],
    },
    userPreferences: {
      preferredLanguage: "auto",
      requireReviewForDestructiveChanges: true,
    },
    unresolvedQuestions: [],
  };
}
