import type { CompoundSolveInput, CompoundSolution } from "../../layout/compound/solve";
import type { CompoundWorkerInput } from "../../layout/workers/protocol";
import { startLayoutWorker } from "./workerJob";
export async function computeCompound(prepared: CompoundSolveInput, signal: AbortSignal, seedOnly = false) {
  if (signal.aborted) throw new Error("Layout cancelled.");
  const job = startLayoutWorker<CompoundWorkerInput, CompoundSolution>({
    createWorker: () =>
      new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
    payload: { prepared: { problem: prepared.problem, sizes: prepared.sizes, theme: prepared.theme }, seedOnly },
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
}
