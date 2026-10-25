import { useCallback, useEffect, useRef, useState, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { diagnoseCompoundLayout, inspectCompoundLayout } from "../../layout/compound/inspection";
import { defaultLayoutIntent, parseLayoutIntent, type CompoundLayoutData } from "../../layout/compound/layout-plan";
import { compileConstraints, layoutScopeMembers } from "../../layout/compound/constraints";
import { runCompoundAiLayout, COMPOUND_AI_BUDGET } from "../../layout/compound/ai/workflow";
import { LayoutRequestError, presentLayoutError } from "../../layout/shared/ai/request";
import { parseCompoundLayout } from "../../graph/compound/layoutData";
import type { StageData } from "../../layout/shared/types";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import type { useCompoundStage } from "./useCompoundStage";
import { computeCompoundStage } from "./computeCompoundStage";
import { useAiActivity } from "../ai/useAiActivity";

export function useCompoundLayoutPlan(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  viewport: {
    stage: StageData | null;
    focusedKey: string | null;
    compoundLayout: ReturnType<typeof useCompoundStage>;
  },
  aiSettings: AiSettings,
) {
  const problem = viewport.stage?.compoundLayout;
  const settings = state.layoutDocument.data.charts.compound;
  const key = JSON.stringify([
    state.document.generation,
    state.editHistory.revision,
    viewport.compoundLayout.inputKey,
    state.chartType,
    aiSettings,
  ]);
  const ready = state.chartType === "compound" && !!problem && !viewport.compoundLayout.loading;
  const current = useRef({ state, key, ready, problem, viewport, aiSettings });
  current.current = { state, key, ready, problem, viewport, aiSettings };
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const { activity, onProgress, clear: clearActivity } = useAiActivity();
  useEffect(clearActivity, [state.document.generation, clearActivity]);
  const active = useRef<AbortController | null>(null);
  const cancel = useCallback(() => {
    active.current?.abort();
    active.current = null;
    setBusy(false);
  }, []);
  useEffect(() => {
    cancel();
    setMessage("");
    setDetail("");
    return cancel;
  }, [key, cancel]);
  const change = useCallback(
    (patch: Partial<CompoundLayoutData>) => {
      const now = current.current.state;
      // Selecting Automatic starts a fresh algorithmic plan, rather than merely
      // hiding the AI form while retaining its structural/routing decisions.
      const nextPatch =
        patch.method === "automatic" ? { ...patch, direction: "AUTO" as const, constraints: [] } : patch;
      dispatch({
        type: "layoutDocumentChanged",
        generation: now.document.generation,
        data: {
          ...now.layoutDocument.data,
          charts: {
            ...now.layoutDocument.data.charts,
            compound: { ...now.layoutDocument.data.charts.compound, ...nextPatch },
          },
        },
      });
    },
    [dispatch],
  );
  const scopeId = problem?.projection.focusGroupId ?? null;
  const inspect = useCallback((groupId?: string | null) => {
    const p = current.current.problem;
    if (!p) throw new Error("No nested layout is available.");
    return {
      ...inspectCompoundLayout(p, groupId === undefined ? p.projection.focusGroupId : groupId),
      ...diagnoseCompoundLayout(p),
    };
  }, []);
  const run = useCallback(
    async (request: { message: string } | { intent: unknown }) => {
      const initial = current.current;
      const input = initial.viewport.compoundLayout.input;
      if (!initial.ready || !initial.problem || !input || active.current) return "Wait for the current layout.";
      const abort = new AbortController();
      active.current = abort;
      let timedOut = false;
      const timeout = setTimeout(() => {
        timedOut = true;
        abort.abort();
      }, COMPOUND_AI_BUDGET.timeoutMs);
      setBusy(true);
      setMessage("Planning layout…");
      setDetail("");
      clearActivity();
      try {
        let data: CompoundLayoutData;
        let computed: StageData | undefined;
        if ("message" in request) {
          if (!initial.aiSettings.baseUrl.trim() || !initial.aiSettings.model.trim())
            throw new Error("Configure a model in Settings → AI.");
          const result = await runCompoundAiLayout({
            settings: initial.aiSettings,
            problem: initial.problem,
            currentStage: initial.viewport.stage!,
            message: request.message,
            signal: abort.signal,
            onProgress: (event) => {
              if (active.current === abort && !abort.signal.aborted && current.current.key === initial.key)
                onProgress(event);
            },
            compute: (data) => computeCompoundStage({ ...input, layout: parseCompoundLayout(data) }, abort.signal),
            onStatus: (message) => {
              if (active.current === abort) setMessage(message);
            },
          });
          data = result.data;
          computed = result.stage;
        } else {
          const intent = parseLayoutIntent(request.intent);
          data = {
            ...compileConstraints(initial.problem, intent, layoutScopeMembers(initial.problem, intent)),
            method: "ai",
            objective: intent.objective,
          };
        }
        if (abort.signal.aborted || current.current.key !== initial.key) return "Layout cancelled.";
        setMessage("Arranging…");
        data = parseCompoundLayout(data);
        const nextInput = { ...input, layout: data };
        const stage = computed ?? (await computeCompoundStage(nextInput, abort.signal));
        if (abort.signal.aborted || current.current.key !== initial.key) return "Layout cancelled.";
        // Transfer the one computed stage into the live renderer, then commit only its declaration.
        if (!initial.viewport.compoundLayout.install(input, nextInput, stage)) return "Layout context changed.";
        // Commit the model's selection without invoking the Automatic tab reset.
        dispatch({
          type: "layoutDocumentChanged",
          generation: initial.state.document.generation,
          data: {
            ...initial.state.layoutDocument.data,
            charts: { ...initial.state.layoutDocument.data.charts, compound: data },
          },
        });
        setMessage("Layout applied.");
        return "Layout applied.";
      } catch (error) {
        if (current.current.key === initial.key && active.current === abort) {
          const report = presentLayoutError(
            abort.signal.aborted
              ? new LayoutRequestError(
                  timedOut ? "completion" : "cancelled",
                  timedOut ? "Layout planning exceeded four minutes." : "Layout cancelled.",
                )
              : error,
          );
          setMessage(report.message);
          setDetail(report.detail);
        }
        return "Layout failed. Current layout kept.";
      } finally {
        clearTimeout(timeout);
        if (active.current === abort) {
          active.current = null;
          setBusy(false);
        }
      }
    },
    [dispatch, onProgress, clearActivity],
  );
  return {
    ready,
    activity,
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
    defaultIntent: { ...defaultLayoutIntent(scopeId), objective: settings.objective },
    scopeTitle: scopeId ?? "Current view",
    quality: viewport.stage?.layoutQuality,
    diagnostics: viewport.stage?.warnings ?? [],
    loading: viewport.compoundLayout.loading,
    error: viewport.compoundLayout.error,
  };
}
export type CompoundLayoutController = ReturnType<typeof useCompoundLayoutPlan>;
