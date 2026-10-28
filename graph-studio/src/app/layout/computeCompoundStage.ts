import type { buildCompoundStage } from "../../layout/compound/layout";
import { automaticIntent } from "../../layout/compound/automatic";
import type { LayoutResult } from "../../layout/compound/layout-plan";
import type { CompoundWorkerInput, CompoundPlacementInput } from "../../layout/workers/protocol";
import type { layoutCompoundHierarchy } from "../../layout/compound/hierarchy-layout";
import { startLayoutWorker } from "./workerJob";

export type CompoundStageInput = Omit<Parameters<typeof buildCompoundStage>[0], "solve" | "place">;
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
export async function computeCompoundStage(input: CompoundStageInput, signal: AbortSignal) {
  const { buildCompoundStage } = await import("../../layout/compound/layout");
  const run = async <Result>(payload: CompoundWorkerInput | CompoundPlacementInput): Promise<Result> => {
    if (signal.aborted) throw new Error("Layout cancelled.");
    const job = startLayoutWorker<typeof payload, Result>({
      createWorker: () =>
        new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
      payload,
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
  };
  if (signal.aborted) throw new Error("Layout cancelled.");
  return buildCompoundStage({
    ...input,
    place: (...placement) => run<ReturnType<typeof layoutCompoundHierarchy>>({ placement }),
    solve: (problem) => run<LayoutResult>({ problem, intent: automaticIntent(problem) }),
  });
}
