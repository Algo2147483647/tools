import { timelinePlanBasis } from "../../layout/timeline/plan-basis";
import { useCallback, useEffect, useRef, useState, useMemo, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { type TimelineLayoutData } from "../../graph/timeline/layoutData";
import type { StageData } from "../../layout/shared/types";
import { runTimelineAiLayout, type TimelineAiResult } from "../../layout/timeline/ai/workflow";
import { presentLayoutError } from "../../layout/shared/ai/request";
import type { TimelineLayoutCandidate, TimelineLayoutInput } from "../../layout/timeline/layout-candidate";
import { measureTimelineLayout } from "../../layout/timeline/layout-quality";
import type { TimelineWorkerInput } from "../../layout/workers/protocol";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { startLayoutWorker, type LayoutWorkerJob } from "./workerJob";
import { useAiActivity } from "../ai/useAiActivity";

export function useTimelineLayout(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  settings: AiSettings,
  view: {
    stage: StageData | null;
    focusedKey: string | null;
    timelineLayout: { base: StageData | null; layoutInput: TimelineLayoutInput | null; ready: boolean };
  },
) {
  const input = view.timelineLayout.layoutInput,
    baseline =
      view.stage &&
      view.timelineLayout.base &&
      view.stage.nodes.length === view.timelineLayout.base.nodes.length &&
      view.stage.edges.length === view.timelineLayout.base.edges.length
        ? view.stage
        : view.timelineLayout.base;
  const signature = JSON.stringify([state.document.generation, state.chartType, state.timelineSettings, settings]);
  const epoch = useRef({ signature, input, stage: view.stage, history: state.editHistory, key: 0 });
  if (
    epoch.current.signature !== signature ||
    epoch.current.input !== input ||
    epoch.current.stage !== view.stage ||
    epoch.current.history !== state.editHistory
  )
    epoch.current = { signature, input, stage: view.stage, history: state.editHistory, key: epoch.current.key + 1 };
  const key = epoch.current.key;
  const ready =
    state.chartType === "timeline" && !!state.dag && !!baseline && !!input && !!view.stage && view.timelineLayout.ready;
  const current = useRef({ state, settings, key, input, baseline, ready, focus: view.focusedKey });
  current.current = { state, settings, key, input, baseline, ready, focus: view.focusedKey };
  const [report, setReport] = useState<TimelineAiResult | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { activity, onProgress, clear: clearActivity, finish: finishActivity } = useAiActivity();
  useEffect(clearActivity, [state.document.generation, state.chartType, clearActivity]);
  const active = useRef<{
    key: number;
    abort: AbortController;
    job?: LayoutWorkerJob<TimelineLayoutCandidate>;
  } | null>(null);
  const sequence = useRef(0);
  const cancel = useCallback(() => {
    sequence.current++;
    const pending = active.current;
    if (pending) {
      active.current = null;
      pending.abort.abort();
      pending.job?.cancel();
      setMessage("Timeline layout cancelled.");
    }
    setBusy(false);
    finishActivity();
  }, [finishActivity]);
  useEffect(() => {
    if (active.current && active.current.key !== key) cancel();
  }, [key, cancel]);
  useEffect(() => {
    setReport(null);
    setMessage("");
  }, [state.document.generation, state.chartType]);
  useEffect(
    () => () => {
      sequence.current++;
      const pending = active.current;
      active.current = null;
      pending?.abort.abort();
      pending?.job?.cancel();
    },
    [],
  );
  const commit = (data: TimelineLayoutData) => {
    const now = current.current;
    if (!now.ready || !now.state.dag) return false;
    dispatch({
      type: "timelineLayoutCommitted",
      generation: now.state.document.generation,
      revision: now.state.editHistory.revision,
      beforeDag: now.state.dag,
      historyBase: now.state.editHistory,
      data,
    });
    return true;
  };
  const setMode = (mode: TimelineLayoutData["mode"]) => {
    cancel();
    setReport(null);
    setMessage("");
    const data = current.current.state.layoutDocument.data.charts.timeline;
    if (mode !== data.mode || mode === "algorithm") commit({ ...data, mode });
  };
  const generate = async (prompt: string) => {
    const initial = current.current;
    if (!initial.ready || !initial.input || !initial.baseline || !prompt.trim()) return;
    if (!initial.settings.baseUrl.trim() || !initial.settings.model.trim()) {
      setMessage("Configure a model in Settings → AI.");
      return;
    }
    cancel();
    const id = sequence.current;
    const abort = new AbortController();
    const pending: NonNullable<typeof active.current> = { key: initial.key, abort };
    active.current = pending;
    setReport(null);
    setBusy(true);
    clearActivity();
    setMessage("Planning timeline layout…");
    try {
      setErrorDetail("");
      const result = await runTimelineAiLayout({
        settings: initial.settings,
        input: initial.input,
        baseline: initial.baseline,
        message: prompt,
        signal: abort.signal,
        onStatus: setMessage,
        onProgress: (event) => {
          if (sequence.current === id && !abort.signal.aborted) onProgress(event);
        },
        compute: async (plan) => {
          const payload: TimelineWorkerInput = { input: initial.input!, baseline: initial.baseline!, plan };
          pending.job = startLayoutWorker<TimelineWorkerInput, TimelineLayoutCandidate>({
            createWorker: () =>
              new Worker(new URL("../../layout/workers/timeline.worker.ts", import.meta.url), { type: "module" }),
            payload,
            failureMessage: "Timeline worker failed.",
            invalidMessage: "Invalid timeline geometry.",
            cancelMessage: "Timeline layout cancelled.",
          });
          return pending.job.result;
        },
      });
      if (sequence.current !== id || current.current.key !== initial.key || abort.signal.aborted) return;
      active.current = null;
      if (result.candidateId !== "current")
        commit({ version: 1, mode: "ai", plan: result.plan, basis: timelinePlanBasis(initial.input) });
      setReport(result);
      setMessage(result.changed ? "AI layout applied." : "AI retained the current arrangement.");
    } catch (error) {
      if (sequence.current === id) {
        const detail = presentLayoutError(error);
        setMessage(detail.message);
        setErrorDetail(detail.detail);
      }
    } finally {
      pending.job?.cancel();
      if (sequence.current === id) {
        active.current = null;
        setBusy(false);
        finishActivity();
      }
    }
  };
  const saved = state.layoutDocument.data.charts.timeline;
  return {
    ready,
    activity,
    busy,
    message,
    report,
    errorDetail,
    quality: useMemo(() => (view.stage?.timeline ? measureTimelineLayout(view.stage) : null), [view.stage]),
    mode: saved.mode,
    hasPlan: !!saved.plan,
    warning: state.layoutDocument.notice,
    count: baseline?.nodes.length ?? 0,
    generate,
    cancel,
    setMode,
    dismiss: () => {
      setReport(null);
      setMessage("");
    },
  };
}
export type TimelineLayoutController = ReturnType<typeof useTimelineLayout>;
