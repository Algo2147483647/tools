import { useEffect, useMemo, useRef, useState } from "react";
import { prepareCompound, type CompoundInput, type PreparedCompound } from "../../layout/compound/prepare";
import { assembleCompoundScene } from "../../layout/compound/scene";
import { validateCompoundResult } from "../../layout/compound/result";
import type { CompoundSolution } from "../../layout/compound/solve";
import type { LayoutGeometry, LayoutProblem } from "../../layout/compound/layout-plan";
import { graphLayoutIdentity, layoutIdentity, type LayoutRendering } from "../../schema/layoutGeometry";
import { useLayoutCache } from "../../layout/runtime/useLayoutCache";
import { LayoutJobChannel } from "../../layout/runtime/job";
import { computeCompound } from "./computeCompound";

export function compoundInputKey(input: CompoundInput) {
  return layoutIdentity([
    input.view,
    input.selectedType,
    { ...input.appearance, fontMetricsKey: undefined },
    input.showNodeDetail,
    input.alignNodeWidthsToMax,
    input.showEdgeLabels,
    input.layout,
  ]);
}
export function useCompoundLayout(
  input: CompoundInput | null,
  generation: number,
  saved?: LayoutRendering,
  settingsKey?: string,
) {
  const prepared = useMemo(() => (input ? prepareCompound(input) : null), [input]);
  const cache = useLayoutCache<CompoundSolution>(generation);
  const channel = useRef(new LayoutJobChannel());
  const key = prepared ? layoutIdentity([prepared.problem.fingerprint, prepared.problem.stored]) : "";
  const graphKey = useMemo(() => (input ? graphLayoutIdentity(input.dag) : ""), [input?.dag]);
  const scope = useMemo(
    () => (input ? layoutIdentity([generation, graphKey, input.view, input.selectedType]) : ""),
    [generation, graphKey, input?.view, input?.selectedType],
  );
  const [displayed, setDisplayed] = useState<{
    key: string;
    scope: string;
    prepared: PreparedCompound;
    solution: CompoundSolution;
  } | null>(null);
  const [failure, setFailure] = useState({ key: "", scope: "", error: "" });
  const restored = useMemo(() => {
    if (
      !prepared ||
      !input ||
      !saved ||
      saved.inputFingerprint !== prepared.problem.fingerprint ||
      saved.graphFingerprint !== graphKey ||
      saved.settingsFingerprint !== settingsKey
    )
      return null;
    const g = saved.geometry;
    const geometry: LayoutGeometry = {
      width: g.size[0],
      height: g.size[1],
      boxes: Object.fromEntries([
        ...g.nodes.map((n) => [
          n.id,
          { x: n.position[0] - n.size[0] / 2, y: n.position[1] - n.size[1] / 2, width: n.size[0], height: n.size[1] },
        ]),
        ...(g.groups ?? []).map((n) => [
          n.id,
          { x: n.position[0], y: n.position[1], width: n.size[0], height: n.size[1] },
        ]),
      ]),
      routes: Object.fromEntries(
        g.edges.map((e) => [
          e.id,
          { points: (e.points ?? []).map(([x, y]) => ({ x, y })), labelPosition: { x: e.label[0], y: e.label[1] } },
        ]),
      ),
    };
    const problem: LayoutProblem = { ...prepared.problem, baseline: geometry, design: saved.compoundDesign };
    try {
      return { problem, result: validateCompoundResult(geometry, problem) };
    } catch {
      return null;
    }
  }, [prepared, saved, settingsKey]);
  const hit = restored ?? (key ? cache.get(key) : undefined);
  useEffect(() => {
    channel.current.cancel();
    if (!prepared) return;
    if (hit) {
      cache.set(key, hit);
      setDisplayed({ key, scope, prepared, solution: hit });
      return;
    }
    // AI is explicit. Preparing its model never starts the automatic optimizer.
    if (prepared.problem.stored.method === "ai") return;
    const job = channel.current.begin(`${generation}:${key}`);
    const timer = setTimeout(() => {
      void computeCompound(prepared, job.signal)
        .then((solution) => {
          if (!job.current()) return;
          cache.set(key, solution);
          setDisplayed({ key, scope, prepared, solution });
          setFailure({ key, scope, error: "" });
          job.finish();
        })
        .catch((error) => {
          if (!job.current()) return;
          setFailure({ key, scope, error: error instanceof Error ? error.message : "Layout failed." });
          job.finish();
        });
    }, 100);
    return () => {
      clearTimeout(timer);
      channel.current.cancel();
    };
  }, [key, generation, scope, restored]);
  const solution = hit ?? (displayed?.scope === scope ? displayed.solution : null);
  const current = Boolean(
    hit ||
    (displayed?.scope === scope &&
      (displayed.key === key ||
        (prepared?.problem.stored.method === "ai" &&
          displayed.solution.problem.fingerprint === prepared.problem.fingerprint))),
  );
  const error = failure.key === key && failure.scope === scope && !current ? failure.error : "";
  const sceneInput = current ? prepared : displayed?.scope === scope ? displayed.prepared : null;
  const stage = useMemo(
    () => (sceneInput && solution ? assembleCompoundScene(sceneInput, solution.result) : null),
    [sceneInput, solution],
  );
  return {
    input,
    inputKey: input ? compoundInputKey(input) : "",
    prepared,
    problem:
      solution && prepared && current
        ? { ...prepared.problem, baseline: solution.result.geometry, design: solution.problem.design }
        : null,
    stage,
    quality: solution?.result.quality,
    error,
    loading: Boolean(prepared && !current && !error && prepared.problem.stored.method !== "ai"),
    stale: Boolean(stage && !current),
    async acquireProblem(signal: AbortSignal): Promise<LayoutProblem> {
      if (!prepared) throw new Error("No nested graph is available.");
      if (solution && current)
        return { ...prepared.problem, baseline: solution.result.geometry, design: solution.problem.design };
      return (await computeCompound(prepared, signal, true)).problem;
    },
  };
}
