import { useCallback, useEffect, useRef, useState } from "react";
import type { StageData } from "../../layout/shared/types";
import { computeCompoundStage, compoundInputKey, type CompoundStageInput } from "./computeCompoundStage";

type Result = { dag: CompoundStageInput["dag"]; key: string; stage: StageData | null; error: string };
export function useCompoundStage(input: CompoundStageInput | null) {
  const [result, setResult] = useState<Result | null>(null);
  const installed = useRef<Result | null>(null);
  const current = useRef(input);
  current.current = input;
  const key = input ? compoundInputKey(input) : "";
  useEffect(() => {
    if (!input) {
      installed.current = null;
      setResult(null);
      return;
    }
    if (installed.current?.dag === input.dag && installed.current.key === compoundInputKey(input)) return;
    const abort = new AbortController();
    const timer = setTimeout(() => {
      void computeCompoundStage(input, abort.signal)
        .then((stage) => {
          if (abort.signal.aborted) return;
          const next = { dag: input.dag, key: compoundInputKey(input), stage, error: "" };
          installed.current = next;
          setResult(next);
        })
        .catch((error) => {
          if (!abort.signal.aborted)
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
  const install = useCallback((expected: CompoundStageInput, next: CompoundStageInput, stage: StageData) => {
    if (current.current !== expected) return false;
    const value = { dag: next.dag, key: compoundInputKey(next), stage, error: "" };
    installed.current = value;
    setResult(value);
    return true;
  }, []);
  const matches = result?.dag === input?.dag && result?.key === key;
  return {
    input,
    inputKey: key,
    install,
    stage: matches ? (result?.stage ?? null) : null,
    error: matches ? (result?.error ?? "") : "",
    loading: Boolean(input && !matches),
  };
}
