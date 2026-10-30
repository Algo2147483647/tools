import type { PreparedCompound } from "./prepare";
import { layoutCompoundHierarchy } from "./hierarchy-layout";
import { arrangeCompound } from "./automatic";
import { measureLayout, validateLayoutGeometry } from "./layout-quality";
import type { LayoutProblem, LayoutResult } from "./layout-plan";

export type CompoundSolveInput = Pick<PreparedCompound, "problem" | "sizes" | "theme">;
export interface CompoundSolution {
  problem: LayoutProblem;
  result: LayoutResult;
}
export function solveCompound(input: CompoundSolveInput, seedOnly = false): CompoundSolution {
  const placement = layoutCompoundHierarchy(
    input.problem.projection,
    input.sizes,
    input.theme,
    input.problem.showLabels,
    input.problem.labelSizes,
    !seedOnly,
  );
  const problem: LayoutProblem = {
    ...input.problem,
    baseline: {
      boxes: Object.fromEntries(placement.boxes),
      routes: {},
      width: Math.max(placement.width, input.problem.minimumCanvas?.width ?? 0),
      height: Math.max(placement.height, input.problem.minimumCanvas?.height ?? 0),
    },
  };
  // AI requests only a deterministic positional seed. It is explicitly unvalidated,
  // is never published, and must be completed by a generated and validated candidate.
  const result = seedOnly
    ? {
        geometry: problem.baseline,
        diagnostics: [],
        quality: {
          metrics: measureLayout(problem, problem.baseline),
          validation: validateLayoutGeometry(problem, problem.baseline),
          elapsedMs: 0,
        },
      }
    : arrangeCompound(problem);
  return { problem: { ...problem, baseline: result.geometry }, result };
}
