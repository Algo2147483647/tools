import type { buildCompoundStage } from "../../layout/compound/layout";
import { automaticIntent } from "../../layout/compound/automatic";
import type { LayoutResult } from "../../layout/compound/layout-plan";
import type { CompoundWorkerInput } from "../../layout/workers/protocol";
import { startLayoutWorker } from "./workerJob";

export type CompoundStageInput = Omit<Parameters<typeof buildCompoundStage>[0], "solve">;
export function compoundInputKey(input: CompoundStageInput) {
  return JSON.stringify([
    input.view,
    input.selectedType,
    input.appearance,
    input.showNodeDetail,
    input.alignNodeWidthsToMax,
    input.showEdgeLabels,
    input.layout,
  ]);
}
export async function computeCompoundStage(
  input: CompoundStageInput,
  signal: AbortSignal,
) {
  const { buildCompoundStage } = await import("../../layout/compound/layout");
  if (signal.aborted) throw new Error("Layout cancelled.");
  return buildCompoundStage({
    ...input,
    solve: async (problem) => {
      if (signal.aborted) throw new Error("Layout cancelled.");
      const job = startLayoutWorker<CompoundWorkerInput, LayoutResult>({
        createWorker: () =>
          new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
        payload: { problem, intent: automaticIntent(problem) },
        timeoutMs: 15000,
        timeoutMessage: "Layout exceeded 15 seconds. Reduce the visible scope.",
        failureMessage: "Layout worker failed.",
        invalidMessage: "Invalid layout result.",
        cancelMessage: "Layout cancelled.",
      });
      const cancel = () => job.cancel();
      signal.addEventListener("abort", cancel, { once: true });
      try {
        return await job.result;
      } finally {
        signal.removeEventListener("abort", cancel);
      }
    },
  });
}
