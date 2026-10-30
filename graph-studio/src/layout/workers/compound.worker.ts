import { solveCompound, type CompoundSolution } from "../compound/solve";
import { handleLayoutWorker, type CompoundWorkerInput } from "./protocol";
handleLayoutWorker<CompoundWorkerInput, CompoundSolution>(
  self,
  (input) => solveCompound(input.prepared, input.seedOnly),
  "Layout worker failed.",
);
