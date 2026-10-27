import { useEffect, useRef, useState } from "react";
import type { StageData } from "../../layout/shared/types";
import { computeCompoundStage, compoundInputKey, type CompoundStageInput } from "./computeCompoundStage";

type Result = { dag: CompoundStageInput["dag"]; key: string; stage: StageData | null; error: string };
export function useCompoundStage(input: CompoundStageInput | null) {
  const [result, setResult] = useState<Result | null>(null);
  const version = useRef(0);
  const installed = useRef<Result | null>(null);
  const key = input ? compoundInputKey(input) : "";
  useEffect(() => {
    if (!input) {
      installed.current = null;
      setResult(null);
      return;
    }
    if (installed.current?.dag === input.dag && installed.current.key === compoundInputKey(input)) {
      setResult(installed.current);
      return;
    }
    const requestVersion = ++version.current;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void computeCompoundStage(
        input,
        abort.signal,
        installed.current?.dag === input.dag ? (installed.current.stage ?? undefined) : undefined,
      )
        .then((stage) => {
          if (abort.signal.aborted || version.current !== requestVersion) return;
          const next = { dag: input.dag, key: compoundInputKey(input), stage, error: "" };
          installed.current = next;
          setResult(next);
        })
        .catch((error) => {
          if (!abort.signal.aborted && version.current === requestVersion)
            setResult({
              dag: input.dag,
              key: compoundInputKey(input),
              stage: null,
              error: error instanceof Error ? error.message : "Layout failed.",
            });
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      abort.abort();
    };
  }, [input]);
  const matches = result?.dag === input?.dag && result?.key === key;
  return {
    input,
    inputKey: key,
    stage: matches ? (result?.stage ?? null) : null,
    error: matches ? (result?.error ?? "") : "",
    loading: Boolean(input && !matches),
  };
}
