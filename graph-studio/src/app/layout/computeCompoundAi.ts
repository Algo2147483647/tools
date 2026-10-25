import { startLayoutWorker } from "./workerJob";
import type { CompoundExecutionInput, CompoundExecutionResult } from "../../layout/compound/ai/execute";

export async function computeCompoundAi(
  input: CompoundExecutionInput,
  signal: AbortSignal,
): Promise<CompoundExecutionResult> {
  if (signal.aborted) throw new Error("Layout cancelled.");
  const job = startLayoutWorker<CompoundExecutionInput, CompoundExecutionResult>({
    createWorker: () =>
      new Worker(new URL("../../layout/workers/compound-ai.worker.ts", import.meta.url), { type: "module" }),
    payload: input,
    timeoutMs: 15000,
    timeoutMessage: "AI layout calculation exceeded 15 seconds.",
    failureMessage: "AI layout calculation failed.",
    invalidMessage: "Invalid AI calculation result.",
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
