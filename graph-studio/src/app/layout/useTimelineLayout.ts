import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { type TimelineLayoutData } from "../../graph/timeline/layoutData";
import type { StageData } from "../../layout/shared/types";
import { timelineLayoutContext } from "../../layout/timeline/ai/context";
import { presentLayoutError } from "../../layout/shared/ai/request";
import { requestTimelineLayout } from "../../layout/timeline/ai/request";
import type { TimelineLayoutCandidate, TimelineLayoutInput } from "../../layout/timeline/layout-candidate";
import { validateTimelineArrangement } from "../../layout/timeline/layout-quality";
import type { TimelineWorkerInput } from "../../layout/workers/protocol";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { startLayoutWorker, type LayoutWorkerJob } from "./workerJob";

type Review = TimelineLayoutCandidate & { key: number; baseline: StageData; explanation: string };
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
    baseline = view.timelineLayout.base;
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
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
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
  }, []);
  useEffect(() => {
    if (active.current && active.current.key !== key) cancel();
  }, [key, cancel]);
  useEffect(() => {
    setReview(null);
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
    setReview(null);
    setMessage("");
    const data = current.current.state.layoutDocument.data.charts.timeline;
    if (mode !== data.mode) commit({ ...data, mode });
  };
  const generate = async (prompt: string) => {
    const initial = current.current;
    if (!initial.ready || !initial.input || !initial.baseline || !prompt.trim()) return;
    if (!initial.settings.baseUrl.trim() || !initial.settings.model.trim()) {
      setMessage("Configure a model in Settings → AI.");
      return;
    }
    if (initial.baseline.nodes.length > 2000 || initial.baseline.edges.length > 4000) {
      setMessage("Filter the timeline and use Readapt before arranging more than 2,000 events or 4,000 relationships.");
      return;
    }
    cancel();
    const id = sequence.current;
    const abort = new AbortController();
    const pending: NonNullable<typeof active.current> = { key: initial.key, abort };
    active.current = pending;
    setReview(null);
    setBusy(true);
    setMessage("Planning timeline layout…");
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      abort.abort();
    }, 90000);
    try {
      const response = await requestTimelineLayout(
        initial.settings,
        timelineLayoutContext(initial.input, initial.baseline, initial.focus),
        prompt,
        abort.signal,
      );
      if (sequence.current !== id || current.current.key !== initial.key || abort.signal.aborted) return;
      clearTimeout(timeout);
      setMessage("Calculating preview…");
      const payload: TimelineWorkerInput = { input: initial.input, baseline: initial.baseline, plan: response.plan };
      pending.job = startLayoutWorker<TimelineWorkerInput, TimelineLayoutCandidate>({
        createWorker: () =>
          new Worker(new URL("../../layout/workers/timeline.worker.ts", import.meta.url), { type: "module" }),
        payload,
        timeoutMs: 20000,
        timeoutMessage: "Layout exceeded 20 seconds. Filter the timeline and use Readapt.",
        failureMessage: "Timeline worker failed.",
        invalidMessage: "Invalid timeline preview.",
        cancelMessage: "Timeline layout cancelled.",
      });
      const candidate = await pending.job.result;
      if (sequence.current !== id || current.current.key !== initial.key || !current.current.ready) return;
      setReview({
        ...candidate,
        key: initial.key,
        baseline: initial.baseline,
        explanation: "AI ordering evaluated by the local layout algorithm.",
      });
      setMessage("Preview ready.");
    } catch (error) {
      if (sequence.current === id)
        setMessage(timedOut ? "AI request timed out. Try again." : presentLayoutError(error).message);
    } finally {
      clearTimeout(timeout);
      pending.job?.cancel();
      if (sequence.current === id) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  const apply = () => {
    if (!review || review.key !== current.current.key || !current.current.ready) {
      setMessage("This preview is stale. Generate a new preview.");
      return false;
    }
    const errors = validateTimelineArrangement(review.baseline, review.stage);
    if (errors.length) {
      setMessage(errors.join(" "));
      return false;
    }
    if (!commit({ version: 1, mode: "ai", plan: review.plan })) return false;
    setReview(null);
    setMessage("AI layout applied.");
    return true;
  };
  const saved = state.layoutDocument.data.charts.timeline;
  return {
    ready,
    busy,
    message,
    review,
    stale: !!review && review.key !== key,
    mode: saved.mode,
    hasPlan: !!saved.plan,
    warning: state.layoutDocument.notice,
    count: baseline?.nodes.length ?? 0,
    generate,
    cancel,
    apply,
    setMode,
    dismiss: () => {
      setReview(null);
      setMessage("");
    },
  };
}
export type TimelineLayoutController = ReturnType<typeof useTimelineLayout>;
