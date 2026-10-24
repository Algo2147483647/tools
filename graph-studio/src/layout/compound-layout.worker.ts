import { solveCompoundLayout } from "./compound-layout-solver";
import type { LayoutIntent, LayoutProblem } from "./compound-layout-plan";

// Only measured geometry crosses this boundary; the worker never reads DOM or graph files.
const worker = self as unknown as {
  onmessage: ((event: MessageEvent<{ jobId: string; problem: LayoutProblem; intent: LayoutIntent }>) => void) | null;
  postMessage(value: unknown): void;
};
worker.onmessage = ({ data }) => {
  try {
    worker.postMessage({ jobId: data.jobId, result: solveCompoundLayout(data.problem, data.intent) });
  } catch (error) {
    worker.postMessage({ jobId: data.jobId, error: error instanceof Error ? error.message : "Layout worker failed." });
  }
};
