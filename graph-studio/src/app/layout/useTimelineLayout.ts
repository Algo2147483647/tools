import { LayoutJobChannel, type LayoutJob } from "../../layout/runtime/job";
import {
  captureLayoutGeometry,
  layoutIdentity,
  renderingSettings,
  type LayoutRendering,
} from "../../schema/layoutGeometry";
import { useCallback, useEffect, useRef, useState, useMemo, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { type TimelineLayoutData } from "../../graph/timeline/layoutData";
import type { StageData } from "../../layout/shared/types";
import { runTimelineAiLayout, type TimelineAiResult } from "../../layout/timeline/ai/workflow";
import { presentLayoutError } from "../../layout/shared/ai/request";
import type { TimelineLayoutInput } from "../../layout/timeline/input-types";
import { measureTimelineLayout } from "../../layout/timeline/layout-quality";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import { useAiActivity } from "../ai/useAiActivity";

export function useTimelineLayout(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  settings: AiSettings,
  view: {
    stage: StageData | null;
    layoutRenderingContext: Omit<LayoutRendering, "geometry"> | null;
    focusedKey: string | null;
    timelineLayout: { base: StageData | null; layoutInput: TimelineLayoutInput | null; ready: boolean };
  },
) {
  const input = view.timelineLayout.layoutInput,
    baseline = view.stage ?? view.timelineLayout.base;
  const key = layoutIdentity([
    state.document.generation,
    state.chartType,
    input,
    baseline ? captureLayoutGeometry(baseline) : null,
    state.dag,
    settings,
  ]);
  const ready =
    state.chartType === "timeline" && !!state.dag && !!baseline && !!input && !!view.stage && view.timelineLayout.ready;
  const current = useRef({
    state,
    settings,
    key,
    input,
    baseline,
    ready,
    focus: view.focusedKey,
    rendering: view.layoutRenderingContext,
  });
  current.current = {
    state,
    settings,
    key,
    input,
    baseline,
    ready,
    focus: view.focusedKey,
    rendering: view.layoutRenderingContext,
  };
  const [report, setReport] = useState<TimelineAiResult | null>(null);
  const [errorDetail, setErrorDetail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const { activity, onProgress, clear: clearActivity, finish: finishActivity } = useAiActivity();
  useEffect(clearActivity, [state.document.generation, state.chartType, clearActivity]);
  const active = useRef<{
    key: string;
    abort: LayoutJob;
  } | null>(null);
  const channel = useRef(new LayoutJobChannel());
  const cancel = useCallback(() => {
    channel.current.cancel();
    const pending = active.current;
    if (pending) {
      active.current = null;
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
      channel.current.cancel();
      active.current = null;
    },
    [],
  );
  const commit = (data: TimelineLayoutData, rendering?: LayoutRendering) => {
    const now = current.current;
    if (!now.ready || !now.state.dag) return false;
    dispatch({
      type: "timelineLayoutCommitted",
      generation: now.state.document.generation,
      revision: now.state.editHistory.revision,
      beforeDag: now.state.dag,
      historyBase: now.state.editHistory,
      data,
      rendering,
    });
    return true;
  };
  const setMode = (mode: TimelineLayoutData["mode"]) => {
    cancel();
    setReport(null);
    setMessage("");
    const data = current.current.state.layoutSession.data.charts.timeline;
    if (mode !== data.mode || mode === "algorithm") commit({ ...data, mode });
  };
  const generate = async (prompt: string) => {
    const initial = current.current;
    if (!initial.ready || !initial.input || !initial.baseline || !prompt.trim())
      return { ok: false, message: "Timeline layout is not ready." };
    if (!initial.settings.baseUrl.trim() || !initial.settings.model.trim()) {
      setMessage("Configure a model in Settings → AI.");
      return { ok: false, message: "Configure a model in Settings / AI." };
    }
    cancel();
    const abort = channel.current.begin(initial.key);
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
        onStatus: (status) => {
          if (abort.current()) setMessage(status);
        },
        onProgress: (event) => {
          if (abort.current() && !abort.signal.aborted) onProgress(event);
        },
      });
      if (!abort.current() || current.current.key !== initial.key || abort.signal.aborted)
        return { ok: false, message: "Timeline layout cancelled or context changed." };
      if (result.candidateId !== "current" && initial.rendering) {
        const data: TimelineLayoutData = { version: 1, mode: "ai" };
        const charts = { ...initial.state.layoutSession.data.charts, timeline: data };
        commit(data, {
          ...initial.rendering,
          geometry: captureLayoutGeometry(result.stage),
          settingsFingerprint: layoutIdentity(
            renderingSettings("timeline", charts, initial.rendering.scope, initial.state.timelineSettings),
          ),
        });
      }
      setReport(result);
      const message = result.changed ? "AI layout applied." : "AI retained the current arrangement.";
      setMessage(message);
      return { ok: true, message };
    } catch (error) {
      if (abort.current()) {
        const detail = presentLayoutError(error);
        setMessage(detail.message);
        setErrorDetail(detail.detail);
      }
      return {
        ok: false,
        message: abort.signal.aborted ? "Timeline layout cancelled." : presentLayoutError(error).message,
      };
    } finally {
      if (abort.current()) {
        abort.finish();
        active.current = null;
        setBusy(false);
        finishActivity();
      }
    }
  };
  const saved = state.layoutSession.data.charts.timeline;
  return {
    ready,
    activity,
    busy,
    message,
    report,
    errorDetail,
    quality: useMemo(() => (view.stage?.timeline ? measureTimelineLayout(view.stage) : null), [view.stage]),
    mode: saved.mode,
    hasPlan: !!state.layoutSession.data.renderings?.timeline,
    warning: state.layoutSession.notice,
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
