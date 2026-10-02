import { useEffect, useState } from "react";
import elkWorkerUrl from "elkjs/lib/elk-worker.min.js?url";
import type { buildCompoundStage } from "../layout/compound-layout";
import type { StageData } from "../layout/types";

type Input = Parameters<typeof buildCompoundStage>[0];
const cache = new WeakMap<Input["dag"], Map<string, StageData>>();

export function useCompoundStage(input: Input | null) {
  const [result, setResult] = useState<{ input: Input; stage: StageData | null; error: string } | null>(null);
  useEffect(() => {
    if (!input) return;
    let cancelled = false;
    let terminate: (() => void) | undefined;
    const key = JSON.stringify([
      input.view,
      input.selectedType,
      input.appearance,
      input.showNodeDetail,
      input.alignNodeWidthsToMax,
    ]);
    const cached = cache.get(input.dag)?.get(key);
    if (cached) {
      setResult({ input, stage: cached, error: "" });
      return;
    }
    void Promise.all([import("elkjs/lib/elk-api.js"), import("../layout/compound-layout")])
      .then(async ([{ default: ELK }, { buildCompoundStage }]) => {
        if (cancelled) return;
        const worker = new Worker(elkWorkerUrl);
        const elk = new ELK({ workerFactory: () => worker });
        terminate = () => worker.terminate();
        const stage = await buildCompoundStage(input, elk);
        if (cancelled) return;
        const entries = cache.get(input.dag) ?? new Map<string, StageData>();
        if (entries.size >= 24) entries.delete(entries.keys().next().value!);
        entries.set(key, stage);
        cache.set(input.dag, entries);
        setResult({ input, stage, error: "" });
      })
      .catch((error: unknown) => {
        if (!cancelled)
          setResult({
            input,
            stage: null,
            error: error instanceof Error ? error.message : "Unable to lay out subgraphs.",
          });
      })
      .finally(() => terminate?.());
    return () => {
      cancelled = true;
      terminate?.();
    };
  }, [input]);
  return {
    stage: input && result && result.input.dag === input.dag ? result.stage : null,
    error: result?.input === input ? result.error : "",
    loading: Boolean(input && result?.input !== input),
  };
}
