import { useEffect, useState } from "react";
import type { buildCompoundStage } from "../../layout/compound/layout";
import type { StageData } from "../../layout/shared/types";
import type { LayoutResult } from "../../layout/compound/layout-plan";
import { automaticIntent } from "../../layout/compound/automatic";
import { startLayoutWorker, type LayoutWorkerJob } from "./workerJob";
import type { CompoundWorkerInput } from "../../layout/workers/protocol";

type Input = Parameters<typeof buildCompoundStage>[0];
export function useCompoundStage(input: Input | null) {
  const [result, setResult] = useState<{ input: Input; stage: StageData | null; error: string } | null>(null);
  useEffect(() => {
    if (!input) return;
    let cancelled = false;
    let job: LayoutWorkerJob<LayoutResult> | undefined;
    const timer = setTimeout(() => {
      void import("../../layout/compound/layout").then(({ buildCompoundStage }) => buildCompoundStage({ ...input,
        solve: async problem => {
          if (cancelled) throw new Error("Layout cancelled.");
          job = startLayoutWorker<CompoundWorkerInput, LayoutResult>({
            createWorker: () => new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
            payload: { problem, intent: automaticIntent(problem) }, timeoutMs: 15000,
            timeoutMessage: "Layout exceeded 15 seconds. Reduce the visible scope.", failureMessage: "Layout worker failed.",
            invalidMessage: "Invalid layout result.", cancelMessage: "Layout cancelled.",
          });
          return job.result;
        },
      })).then(stage => { if (!cancelled) setResult({ input, stage, error: "" }); })
        .catch(error => { if (!cancelled) setResult({ input, stage: null, error: error instanceof Error ? error.message : "Layout failed." }); });
    }, 100);
    return () => { cancelled = true; clearTimeout(timer); job?.cancel(); };
  }, [input]);
  return {
    input,
    inputKey: input ? JSON.stringify([input.view, input.selectedType, input.appearance, input.showNodeDetail, input.alignNodeWidthsToMax, input.showEdgeLabels, input.layout]) : "",
    stage: result?.input === input ? result?.stage ?? null : null,
    error: result?.input === input ? result?.error ?? "" : "",
    loading: Boolean(input && result?.input !== input),
  };
}
