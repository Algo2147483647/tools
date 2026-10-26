import type { LayoutWorkerRequest, LayoutWorkerResponse } from "../../layout/workers/protocol";

export interface LayoutWorkerJob<Result> {
  result: Promise<Result>;
  cancel(): void;
}

/** Main-thread worker lifetime. Document freshness remains the caller's responsibility. */
export function startLayoutWorker<Input, Result>(options: {
  createWorker(): Worker;
  payload: Input;
  failureMessage: string;
  invalidMessage: string;
  cancelMessage: string;
}): LayoutWorkerJob<Result> {
  let cancel = () => {};
  const result = new Promise<Result>((resolve, reject) => {
    const worker = options.createWorker();
    const jobId = crypto.randomUUID();
    let settled = false;
    const finish = () => {
      if (settled) return false;
      settled = true;
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      return true;
    };
    const fail = (message: string) => {
      if (finish()) reject(new Error(message));
    };
    cancel = () => fail(options.cancelMessage);
    worker.onerror = (event) => fail(event.message || options.failureMessage);
    worker.onmessageerror = () => fail(options.invalidMessage);
    worker.onmessage = ({ data }: MessageEvent<LayoutWorkerResponse<Result>>) => {
      if (data?.jobId !== jobId) return;
      if (!data.ok) return fail(data.error || options.failureMessage);
      if (!data.result) return fail(options.invalidMessage);
      if (finish()) resolve(data.result);
    };
    try {
      worker.postMessage({ jobId, payload: options.payload } satisfies LayoutWorkerRequest<Input>);
    } catch (error) {
      fail(error instanceof Error ? error.message : options.failureMessage);
    }
  });
  return { result, cancel: () => cancel() };
}
