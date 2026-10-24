import { createId } from "./harnessUtils";
import type { ActionPlan, AiExecutionMode, AiHarnessState, ValidationReport, WorkingMemory } from "./types";

export function createInitialAiHarnessState(mode: AiExecutionMode): AiHarnessState {
  const sessionId = createId("session");
  return {
    sessionId,
    graphId: "local-graph",
    graphRevision: "0",
    workingMemory: createEmptyWorkingMemory(),
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

export function installPlan(harness: AiHarnessState, plan: ActionPlan): AiHarnessState {
  return {
    ...harness,
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

export function attachValidationToHarness(harness: AiHarnessState, validation: ValidationReport): AiHarnessState {
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
  return {
    ...harness,
    activePlan,
    pendingCommandBatch: pending,
    workingMemory: {
      ...harness.workingMemory,
      activePlanId: activePlan?.id,
      pendingCommandBatchId: pending?.id,
    },
  };
}

export function markPendingBatchExecuted(harness: AiHarnessState): AiHarnessState {
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
  return {
    ...harness,
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
