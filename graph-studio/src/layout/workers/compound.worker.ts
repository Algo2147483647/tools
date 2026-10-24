import { solveCompoundLayout } from "../compound/layout-solver";
import { handleLayoutWorker, type CompoundWorkerInput } from "./protocol";

// The measured boxes and label sizes come from the main thread.
handleLayoutWorker(
  self,
  ({ problem, intent }: CompoundWorkerInput) => solveCompoundLayout(problem, intent),
  "Layout worker failed.",
);
