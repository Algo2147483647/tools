import type { buildCompoundStage } from "./compound-layout";
import type { StageData } from "./types";

type Input = Parameters<typeof buildCompoundStage>[0];

export function compoundStageCacheKey(input: Input): string {
  return JSON.stringify([
    input.view.focusGroupId,
    [...new Set(input.view.collapsedGroupIds)].sort(),
    input.selectedType ?? "",
    input.appearance,
    input.showNodeDetail,
    input.showEdgeLabels !== false,
    input.alignNodeWidthsToMax,
  ]);
}

/** Last-view LRU avoids recomputation and restores exact coordinates when a view is revisited. */
export class CompoundStageCache {
  private readonly stages = new WeakMap<Input["dag"], Map<string, StageData>>();
  private readonly scopes = new WeakMap<Input["dag"], Map<string | null, StageData>>();

  get(input: Input): StageData | undefined {
    const entries = this.stages.get(input.dag);
    const key = compoundStageCacheKey(input);
    const stage = entries?.get(key);
    if (stage) {
      entries!.delete(key);
      entries!.set(key, stage);
      this.rememberScope(input, stage);
    }
    return stage;
  }

  previous(input: Input): StageData | undefined {
    return this.scopes.get(input.dag)?.get(input.view.focusGroupId);
  }

  set(input: Input, stage: StageData): void {
    const entries = this.stages.get(input.dag) ?? new Map<string, StageData>();
    const key = compoundStageCacheKey(input);
    entries.delete(key);
    entries.set(key, stage);
    if (entries.size > 48) entries.delete(entries.keys().next().value!);
    this.stages.set(input.dag, entries);
    this.rememberScope(input, stage);
  }

  private rememberScope(input: Input, stage: StageData): void {
    const scopes = this.scopes.get(input.dag) ?? new Map<string | null, StageData>();
    scopes.delete(input.view.focusGroupId);
    scopes.set(input.view.focusGroupId, stage);
    if (scopes.size > 48) scopes.delete(scopes.keys().next().value!);
    this.scopes.set(input.dag, scopes);
  }
}
