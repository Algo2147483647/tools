import { arrangeCompound } from "../compound/automatic";
import { layoutCompoundHierarchy } from "../compound/hierarchy-layout";
import type { LayoutResult } from "../compound/layout-plan";
import { handleLayoutWorker, type CompoundWorkerInput, type CompoundPlacementInput } from "./protocol";
handleLayoutWorker<
  CompoundWorkerInput | CompoundPlacementInput,
  LayoutResult | ReturnType<typeof layoutCompoundHierarchy>
>(
  self,
  (input) =>
    "placement" in input ? layoutCompoundHierarchy(...input.placement) : arrangeCompound(input.problem, input.intent),
  "Layout worker failed.",
);
