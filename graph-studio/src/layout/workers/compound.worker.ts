import { arrangeCompound } from "../compound/automatic";
import { arrangePreciseCompound } from "../compound/precise";
import { handleLayoutWorker, type CompoundWorkerInput } from "./protocol";
handleLayoutWorker(
  self,
  ({ problem, intent, runtime }: CompoundWorkerInput) =>
    runtime ? arrangePreciseCompound(problem, runtime) : arrangeCompound(problem, intent),
  "Layout worker failed.",
);
