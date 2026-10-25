import { createLayoutResult } from "../../../schema/layoutResult";
import { applyLayoutResult } from "../../shared/applyLayoutResult";
import type { AiSettings } from "../../../ai/types";
import type { AiProgressListener } from "../../../ai/transport/streaming";
import type { StageData } from "../../shared/types";
import { LayoutRequestError } from "../../shared/ai/request";
import type { TimelineLayoutInput } from "../input-types";
import { measureTimelineLayout } from "../layout-quality";
import { timelineLayoutContext } from "./context";
import { requestTimelineLayout } from "./request";

export async function runTimelineAiLayout(options: {
  settings: AiSettings;
  input: TimelineLayoutInput;
  baseline: StageData;
  message: string;
  signal: AbortSignal;
  onProgress?: AiProgressListener;
  onStatus?(message: string): void;
}) {
  const { baseline, signal } = options;
  const before = measureTimelineLayout(baseline);
  const candidates = new Map<
    string,
    {
      stage: StageData;
      before: ReturnType<typeof measureTimelineLayout>;
      after: ReturnType<typeof measureTimelineLayout>;
    }
  >([
    [
      "current",
      {
        stage: baseline,
        before,
        after: before,
      },
    ],
  ]);
  const observations: unknown[] = [];
  let observed = baseline,
    evaluations = 0;
  const check = () => {
    if (signal.aborted) throw new LayoutRequestError("cancelled", "Layout cancelled.");
  };
  // The model controls iteration and selection. Cancellation is always available; no hidden quality ranker.
  while (true) {
    check();
    options.onStatus?.(evaluations ? "AI is examining timeline results…" : "AI is planning the timeline…");
    const decision = await requestTimelineLayout(
      options.settings,
      {
        ...timelineLayoutContext(options.input, observed),
        currentLayout: createLayoutResult(observed, "timeline"),
        observations,
        candidates: [...candidates.keys()],
      },
      options.message,
      signal,
      options.onProgress,
      { candidates: new Set(candidates.keys()), requireEvaluation: !evaluations },
    );
    check();
    if (decision.action === "finish") {
      const chosen = candidates.get(decision.candidateId)!;
      const changed =
        JSON.stringify([baseline.nodes, baseline.edges]) !== JSON.stringify([chosen.stage.nodes, chosen.stage.edges]);
      return { ...chosen, summary: decision.summary, candidateId: decision.candidateId, evaluations, changed };
    }
    const candidateId = `trial-${++evaluations}`;
    options.onStatus?.(`Evaluating timeline layout ${evaluations}…`);
    try {
      const stage = applyLayoutResult(decision.layout, baseline, options.input.timelineSettings?.pins);
      const candidate = { stage, before, after: measureTimelineLayout(stage, baseline) };
      check();
      candidates.set(candidateId, candidate);
      observed = candidate.stage;
      observations.push({
        candidateId,
        hypothesis: decision.hypothesis,
        layout: decision.layout,
        before: candidate.before,
        after: candidate.after,
        warnings: candidate.stage.warnings,
      });
    } catch (error) {
      check();
      observations.push({
        candidateId,
        selectable: false,
        hypothesis: decision.hypothesis,
        layout: decision.layout,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }
}
export type TimelineAiResult = Awaited<ReturnType<typeof runTimelineAiLayout>>;
