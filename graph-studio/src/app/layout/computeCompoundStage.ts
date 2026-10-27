import type { buildCompoundStage } from "../../layout/compound/layout";
import { automaticIntent } from "../../layout/compound/automatic";
import { layoutFingerprint, type LayoutResult } from "../../layout/compound/layout-plan";
import type { CompoundWorkerInput, CompoundPlacementInput, FcoseWorkerInput } from "../../layout/workers/protocol";
import type { layoutCompoundHierarchy } from "../../layout/compound/hierarchy-layout";
import type { StageData } from "../../layout/shared/types";
import { compoundModeSettings } from "../../graph/compound/layoutData";
import { startLayoutWorker } from "./workerJob";

export type CompoundStageInput = Omit<Parameters<typeof buildCompoundStage>[0], "solve" | "place">;
export function compoundInputKey(input: CompoundStageInput) {
  return JSON.stringify([
    input.view,
    input.selectedType,
    input.appearance,
    input.showNodeDetail,
    input.alignNodeWidthsToMax,
    input.showEdgeLabels,
    input.layout ? { method: input.layout.method, ...compoundModeSettings(input.layout) } : undefined,
  ]);
}
const completed = new Map<string, LayoutResult>();
export async function computeCompoundStage(input: CompoundStageInput, signal: AbortSignal, previous?: StageData) {
  const { measureCompoundStage, solveCompoundStage, renderCompoundStage } =
    await import("../../layout/compound/layout");
  const isFcose = input.layout?.method === "fcose";
  const run = async <Result>(
    payload: CompoundWorkerInput | CompoundPlacementInput | FcoseWorkerInput,
  ): Promise<Result> => {
    if (signal.aborted) throw new Error("Layout cancelled.");
    const job = startLayoutWorker<typeof payload, Result>({
      createWorker: () =>
        isFcose
          ? new Worker(new URL("../../layout/workers/fcose.worker.ts", import.meta.url), { type: "module" })
          : new Worker(new URL("../../layout/workers/compound.worker.ts", import.meta.url), { type: "module" }),
      payload,
      failureMessage: "Layout worker failed.",
      invalidMessage: "Invalid layout result.",
      cancelMessage: "Layout cancelled.",
    });
    const cancel = () => job.cancel();
    signal.addEventListener("abort", cancel, { once: true });
    try {
      return await job.result;
    } finally {
      signal.removeEventListener("abort", cancel);
    }
  };
  if (signal.aborted) throw new Error("Layout cancelled.");
  const measurementStart = performance.now();
  const measured = measureCompoundStage({
    ...input,
    place: (...placement) => run<ReturnType<typeof layoutCompoundHierarchy>>({ placement }),
    solve: (problem) => run<LayoutResult>(isFcose ? { problem } : { problem, intent: automaticIntent(problem) }),
  });
  if (isFcose && previous?.compoundLayout) {
    for (const item of measured.problem.projection.items.filter((i) => i.external)) {
      const old = previous.compoundLayout.baseline.boxes[item.id];
      const size = measured.problem.minimumSizes[item.id];
      if (old && old.width === size.width && old.height === size.height)
        measured.problem.baseline.boxes[item.id] = { ...old };
    }
  }
  const measurementMs = performance.now() - measurementStart;
  const cacheKey = layoutFingerprint([measured.problem.fingerprint, measured.problem.baseline.boxes]);
  let solved = completed.get(cacheKey);
  if (!solved) {
    solved = await solveCompoundStage(measured);
    if (signal.aborted) throw new Error("Layout cancelled.");
    completed.set(cacheKey, structuredClone(solved));
    if (completed.size > 8) completed.delete(completed.keys().next().value!);
  } else solved = structuredClone(solved);
  if (signal.aborted) throw new Error("Layout cancelled.");
  const renderStart = performance.now();
  const stage = renderCompoundStage(measured, solved);
  if (stage.layoutQuality && isFcose)
    stage.layoutQuality = {
      ...stage.layoutQuality,
      timings: {
        ...stage.layoutQuality.timings,
        measurementMs,
        renderingMs: performance.now() - renderStart,
      },
    };
  return stage;
}
