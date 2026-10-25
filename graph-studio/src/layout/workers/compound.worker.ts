import { arrangeCompound } from "../compound/automatic";
import { handleLayoutWorker, type CompoundWorkerInput } from "./protocol";
handleLayoutWorker(
  self,
  ({ problem, intent }: CompoundWorkerInput) =>
    arrangeCompound(problem, intent),
  "Layout worker failed.",
);
