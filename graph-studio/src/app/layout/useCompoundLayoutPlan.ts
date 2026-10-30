import { LayoutJobChannel, type LayoutJob } from "../../layout/runtime/job";
import { useCallback, useEffect, useMemo, useRef, useState, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { diagnoseCompoundLayout, inspectCompoundLayout } from "../../layout/compound/inspection";
import { defaultLayoutIntent, parseLayoutIntent, type CompoundLayoutData } from "../../layout/compound/layout-plan";
import {
  runCompoundAiLayout,
  type CompoundAiReport,
  type CompoundAiEvaluation,
  type CompoundCheckpoint,
} from "../../layout/compound/ai/workflow";
import { computeCompoundAi } from "./computeCompoundAi";
import { LayoutRequestError, presentLayoutError } from "../../layout/shared/ai/request";
import { parseCompoundLayout } from "../../graph/compound/layoutData";
import type { StageData } from "../../layout/shared/types";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import type { useCompoundLayout } from "./useCompoundLayout";
import { compoundInputKey } from "./useCompoundLayout";
import { acceptCompoundResult, compoundResultDocument } from "../../layout/compound/result";
import { assembleCompoundScene } from "../../layout/compound/scene";
import { useAiActivity } from "../ai/useAiActivity";
import {
  captureLayoutGeometry,
  graphLayoutIdentity,
  layoutIdentity,
  renderingSettings,
  type LayoutRendering,
} from "../../schema/layoutGeometry";

export function useCompoundLayoutPlan(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  viewport: {
    stage: StageData | null;
    focusedKey: string | null;
    compoundLayout: ReturnType<typeof useCompoundLayout>;
    layoutRenderingContext: Omit<LayoutRendering, "geometry"> | null;
  },
  aiSettings: AiSettings,
) {
  const problem = viewport.compoundLayout.problem;
  const settings = state.layoutSession.data.charts.compound;
  const key = JSON.stringify([
    state.document.generation,
    state.dag ? graphLayoutIdentity(state.dag) : "",
    viewport.compoundLayout.prepared?.problem.fingerprint,
    viewport.compoundLayout.inputKey,
    state.chartType,
    aiSettings,
  ]);
  const ready =
    state.chartType === "compound" && !!viewport.compoundLayout.prepared && !viewport.compoundLayout.loading;
  const current = useRef({ state, key, ready, problem, viewport, aiSettings });
  current.current = { state, key, ready, problem, viewport, aiSettings };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [checkpoint, setCheckpoint] = useState<{ key: string; value: CompoundCheckpoint } | null>(null);
  const checkpointRef = useRef(checkpoint);
  checkpointRef.current = checkpoint;
  const { activity, onProgress, clear: clearActivity, finish: finishActivity } = useAiActivity();
  const [lastRun, setLastRun] = useState<{
    report: CompoundAiReport;
    inputKey: string;
    dag: GraphAppState["dag"];
    geometryKey: string;
  } | null>(null);
  const savedGeometry = state.layoutSession.data.renderings?.compound?.geometry;
  const savedGeometryKey = useMemo(() => (savedGeometry ? layoutIdentity(savedGeometry) : ""), [savedGeometry]);
  const [evaluations, setEvaluations] = useState<CompoundAiEvaluation[]>([]);
  useEffect(() => {
    clearActivity();
    setLastRun(null);
    setEvaluations([]);
    setMessage("");
    setDetail("");
  }, [state.document.generation, clearActivity]);
  const channel = useRef(new LayoutJobChannel());
  const active = useRef<LayoutJob | null>(null);
  const cancel = useCallback(() => {
    channel.current.cancel();
    active.current = null;
    setBusy(false);
    finishActivity();
  }, [finishActivity]);
  useEffect(() => {
    setCheckpoint(null);
    if (active.current) {
      cancel();
      setMessage("Layout context changed. AI run cancelled; current layout kept.");
    }
  }, [key, cancel]);
  useEffect(() => cancel, [cancel]);
  const change = useCallback(
    (patch: Partial<CompoundLayoutData>) => {
      const now = current.current.state;
      dispatch({
        type: "layoutSessionChanged",
        generation: now.document.generation,
        data: {
          ...now.layoutSession.data,
          renderings: { ...now.layoutSession.data.renderings, compound: undefined },
          charts: {
            ...now.layoutSession.data.charts,
            compound: { ...now.layoutSession.data.charts.compound, ...patch },
          },
        },
      });
    },
    [dispatch],
  );
  const scopeId = problem?.projection.focusGroupId ?? null;
  const inspect = useCallback((groupId?: string | null) => {
    const p = current.current.problem;
    if (!p) {
      const prepared = current.current.viewport.compoundLayout.prepared;
      if (!prepared) throw new Error("No nested graph is available.");
      return {
        status: "prepared",
        scopeId: prepared.problem.projection.focusGroupId,
        nodes: prepared.problem.projection.items,
        edges: prepared.problem.projection.edges,
        minimumSizes: prepared.problem.minimumSizes,
        message: "Measured model ready. No accepted geometry; AI generation is explicit.",
      };
    }
    return {
      ...inspectCompoundLayout(p, groupId === undefined ? p.projection.focusGroupId : groupId),
      ...diagnoseCompoundLayout(p),
    };
  }, []);
  const run = useCallback(
    async (request: { message: string; resume?: boolean } | { intent: unknown }) => {
      const initial = current.current;
      const input = initial.viewport.compoundLayout.input;
      if (!initial.ready || !input || active.current) return { ok: false, message: "Wait for the current layout." };
      const abort = channel.current.begin(initial.key);
      active.current = abort;
      setBusy(true);
      setMessage("Planning layout…");
      setDetail("");
      const saved =
        "message" in request && request.resume && checkpointRef.current?.key === initial.key
          ? checkpointRef.current.value
          : undefined;
      if ("message" in request && request.resume && !saved) {
        abort.finish();
        active.current = null;
        setBusy(false);
        return { ok: false, message: "No matching layout work to resume." };
      }
      if (!saved) {
        clearActivity();
        setCheckpoint(null);
      }
      setLastRun(null);
      setEvaluations(saved?.trials ?? []);
      try {
        setMessage(initial.problem ? "Planning layout…" : "Preparing a positional seed for AI…");
        const problem = await initial.viewport.compoundLayout.acquireProblem(abort.signal);
        let data: CompoundLayoutData;
        let stage: StageData;
        let report: CompoundAiReport | undefined;
        if ("message" in request) {
          if (!initial.aiSettings.baseUrl.trim() || !initial.aiSettings.model.trim())
            throw new Error("Configure a model in Settings → AI.");
          const result = await runCompoundAiLayout({
            execute: computeCompoundAi,
            settings: initial.aiSettings,
            problem,
            message: request.message,
            signal: abort.signal,
            checkpoint: saved,
            onCheckpoint: (value) => {
              if (current.current.key === initial.key && (active.current === abort || active.current === null))
                setCheckpoint({ key: initial.key, value });
            },
            onProgress: (event) => {
              if (active.current === abort && !abort.signal.aborted && current.current.key === initial.key)
                onProgress(event);
            },
            onEvaluation: (evaluation) => {
              if (active.current === abort && !abort.signal.aborted)
                setEvaluations((previous) => [...previous, evaluation]);
            },
            onStatus: (message) => {
              if (active.current === abort) setMessage(message);
            },
          });
          data = result.data;
          stage = assembleCompoundScene(initial.viewport.compoundLayout.prepared!, result.result);
          report = result.report;
          setCheckpoint(null);
        } else {
          const intent = parseLayoutIntent(request.intent);
          const result = await computeCompoundAi(
            {
              problem,
              baseLayout: compoundResultDocument(problem, problem.baseline),
              decision: {
                action: "console-intent",
                intent,
              },
            },
            abort.signal,
          );
          if (result.error) throw new Error(result.error);
          data = result.data;
          stage = assembleCompoundScene(
            initial.viewport.compoundLayout.prepared!,
            acceptCompoundResult(result.layout, { ...problem, stored: data }),
          );
        }
        if (abort.signal.aborted || current.current.key !== initial.key)
          return { ok: false, message: "Layout cancelled." };
        setMessage("Arranging…");
        data = parseCompoundLayout(data);
        const nextInput = { ...input, layout: data };
        if (abort.signal.aborted || current.current.key !== initial.key)
          return { ok: false, message: "Layout cancelled." };
        const context = initial.viewport.layoutRenderingContext;
        if (!context) return { ok: false, message: "Layout context changed." };
        const charts = { ...initial.state.layoutSession.data.charts, compound: data };
        const rendering: LayoutRendering = {
          ...context,
          ...(report?.design ? { compoundDesign: report.design } : {}),
          geometry: captureLayoutGeometry(stage),
          settingsFingerprint: layoutIdentity(
            renderingSettings("compound", charts, context.scope, context.timelineSettings),
          ),
        };
        // Commit the model's selection without invoking the Automatic tab reset.
        dispatch({
          type: "layoutSessionChanged",
          generation: initial.state.document.generation,
          data: {
            ...initial.state.layoutSession.data,
            renderings: { ...initial.state.layoutSession.data.renderings, compound: rendering },
            charts,
          },
        });
        if (report)
          setLastRun({
            report,
            inputKey: compoundInputKey(nextInput),
            dag: initial.state.dag,
            geometryKey: layoutIdentity(rendering.geometry),
          });
        const outcome =
          report?.candidateId === "current"
            ? "AI kept the current layout."
            : report && !report.changed
              ? "AI plan applied. Geometry is unchanged."
              : report
                ? "AI layout applied. Geometry changed."
                : "Layout applied.";
        setMessage(outcome);
        return { ok: true, message: outcome };
      } catch (error) {
        if (current.current.key === initial.key && active.current === abort) {
          const report = presentLayoutError(
            abort.signal.aborted ? new LayoutRequestError("cancelled", "Layout cancelled.") : error,
          );
          setMessage(report.message);
          setDetail(report.detail);
        }
        return {
          ok: false,
          message: abort.signal.aborted
            ? "Layout cancelled. Current layout kept."
            : `Layout failed: ${error instanceof Error ? error.message : "Unknown error"}. Current layout kept.`,
        };
      } finally {
        if (active.current === abort) {
          abort.finish();
          active.current = null;
          setBusy(false);
          finishActivity();
        }
      }
    },
    [dispatch, onProgress, clearActivity, finishActivity],
  );
  return {
    ready,
    activity,
    lastRun: lastRun?.report ?? null,
    lastRunCurrent:
      !!lastRun &&
      lastRun.geometryKey === savedGeometryKey &&
      lastRun.dag === state.dag &&
      lastRun.inputKey === viewport.compoundLayout.inputKey &&
      state.chartType === "compound",
    evaluations,
    toolTrace: checkpoint?.key === key ? checkpoint.value.trace : (lastRun?.report.tools ?? []),
    canResume: !busy && ready && checkpoint?.key === key,
    resume: () => run({ message: checkpointRef.current?.value.message ?? "", resume: true }),
    busy,
    message,
    detail,
    settings,
    change,
    inspect,
    cancel: () => {
      cancel();
      setMessage("Layout cancelled. Current layout kept.");
      setDetail("");
    },
    generate: (message: string) => run({ message }),
    propose: (intent: unknown) => run({ intent }),
    defaultIntent: defaultLayoutIntent(scopeId),
    scopeTitle: scopeId ?? "Current view",
    stale: viewport.compoundLayout.stale,
    quality: viewport.compoundLayout.quality,
    diagnostics: viewport.stage?.warnings ?? [],
    loading: viewport.compoundLayout.loading,
    error: viewport.compoundLayout.error,
  };
}
export type CompoundLayoutController = ReturnType<typeof useCompoundLayoutPlan>;
