export interface LayoutWorkerRequest<Input> {
  jobId: string;
  payload: Input;
}

export type LayoutWorkerResponse<Result> =
  { jobId: string; ok: true; result: Result } | { jobId: string; ok: false; error: string };

export interface CompoundWorkerInput {
  prepared: import("../compound/solve").CompoundSolveInput;
  seedOnly?: boolean;
}

interface LayoutWorkerScope<Input, Result> {
  onmessage: ((event: MessageEvent<LayoutWorkerRequest<Input>>) => void) | null;
  postMessage(message: LayoutWorkerResponse<Result>): void;
}

/** Workers compute synchronously; their controllers own cancellation and stale-result checks. */
export function handleLayoutWorker<Input, Result>(
  scope: LayoutWorkerScope<Input, Result>,
  execute: (input: Input) => Result,
  fallbackError: string,
): void {
  scope.onmessage = ({ data }) => {
    try {
      scope.postMessage({ jobId: data.jobId, ok: true, result: execute(data.payload) });
    } catch (error) {
      scope.postMessage({
        jobId: data.jobId,
        ok: false,
        error: error instanceof Error ? error.message : fallbackError,
      });
    }
  };
}
