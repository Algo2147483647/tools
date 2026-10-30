import { prepareCompound, type CompoundInput } from "../layout/compound/prepare";
import { solveCompound } from "../layout/compound/solve";
import { assembleCompoundScene } from "../layout/compound/scene";
import { acceptCompoundResult } from "../layout/compound/result";
import type { LayoutResultDocument } from "../schema/layoutResult";
import { prepareSpatialModel } from "../layout/spatial/model";
import { projectSpatialModel } from "../layout/spatial/project";
import { defaultSpaceView, getSpaceMetadata } from "../graph/space";
import type { NormalizedDag } from "../graph/types";

export async function compoundFixtureScene(input: CompoundInput) {
  const prepared = prepareCompound(input),
    solution = solveCompound(prepared);
  return {
    ...assembleCompoundScene(prepared, solution.result),
    prepared,
    compoundLayout: solution.problem,
    layoutQuality: solution.result.quality,
  };
}
export function acceptCompoundFixture(
  value: LayoutResultDocument,
  base: Awaited<ReturnType<typeof compoundFixtureScene>>,
) {
  const result = acceptCompoundResult(value, base.compoundLayout);
  return {
    ...assembleCompoundScene(base.prepared, result),
    prepared: base.prepared,
    compoundLayout: { ...base.compoundLayout, baseline: result.geometry },
    layoutQuality: result.quality,
  };
}
export function spatialFixtureScene(
  input: Parameters<typeof projectSpatialModel>[1] & { colorSourceDag?: NormalizedDag },
) {
  const view = input.spaceView ?? defaultSpaceView(getSpaceMetadata(input.dag));
  return projectSpatialModel(prepareSpatialModel(input.colorSourceDag ?? input.dag, view.axes), input);
}
