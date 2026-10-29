import { getGraphTypeOptions, type TypeFilter } from "../../graph/typeFilter";
import type { GraphChartType } from "../../graph/types";
import { defaultLayoutIntent } from "../../graph/compound/layoutData";
import { useRef, type Dispatch } from "react";
import type { GraphAppState } from "../document/initialState";
import type { GraphAction } from "../document/graphActions";
import type { GraphViewportController } from "../viewport/useGraphViewport";
import type { CompoundLayoutController } from "../layout/useCompoundLayoutPlan";
import type { TimelineLayoutController } from "../layout/useTimelineLayout";
import type { ChartStyle } from "../../schema/appearance/types";
import type { SpaceView } from "../../graph/space";
import { validateRuntimeInstruction, type ConsoleEnvironment } from "../../console/runtime";
import { domainAvailability, getDomainCommand, type DomainInstruction } from "../../console/domainRegistry";

interface RuntimeJob {
  id: string;
  status: "running" | "completed" | "cancelled" | "failed";
  message: string;
}
export function useConsoleRuntime(
  state: GraphAppState,
  dispatch: Dispatch<GraphAction>,
  style: ChartStyle,
  viewport: GraphViewportController,
  compound: CompoundLayoutController,
  timeline: TimelineLayoutController,
  report: (tone: "info" | "success" | "error", message: string) => void,
) {
  const job = useRef<RuntimeJob | null>(null);
  const sequence = useRef(0);
  const current = useRef({ state, viewport, compound, timeline, style });
  current.current = { state, viewport, compound, timeline, style };
  const getEnvironment = (): ConsoleEnvironment => {
    const { state: s, viewport: v, compound: c, timeline: t, style } = current.current;
    return {
      inspectLayout: (scope) =>
        s.chartType === "compound"
          ? {
              result: c.inspect(scope === "root" ? null : scope),
              intentTemplate: defaultLayoutIntent(),
              intentRules:
                "All constraints have strength:soft. direction:{scopeId,value:AUTO|RIGHT|DOWN}; flow-order:{scopeId,nodeIds}; prefer-outer-route:{edgeId}; port-side:{edgeId,end:source|target,side:east|south|west|north}.",
            }
          : s.chartType === "timeline"
            ? { quality: t.quality, report: t.report }
            : { method: s.layout.mode, nodes: v.stage?.nodes.length },
      style: { ...style, ...(s.chartType === "timeline" ? { timeline: s.timelineSettings } : {}) },
      view: {
        selection: s.selection,
        focusedKey: v.focusedKey,
        activeType: v.activeType,
        typeFilter: v.typeFilter,
        typeOptions: s.dag ? getGraphTypeOptions(s.dag) : [],
        zoomPercent: v.zoomPercent,
        canBack: v.canBack,
        canUp: v.canUp,
        canUndo: s.editHistory.undoStack.length > 0,
        canRedo: s.editHistory.redoStack.length > 0,
        activeTrack: v.activeTrack,
        timelineRange: v.activeTimelineRange,
        compound: v.compound.view,
        spatial: v.spatialView.view,
      },
      layout: {
        ready: s.chartType === "compound" ? c.ready : s.chartType === "timeline" ? t.ready : !!v.stage,
        busy: s.chartType === "compound" ? c.busy : s.chartType === "timeline" ? t.busy : false,
        canResume: s.chartType === "compound" && c.canResume,
        scope: v.compound.view.focusGroupId ?? "root",
        metrics:
          s.chartType === "timeline"
            ? t.quality
            : s.chartType === "compound"
              ? c.quality
              : { method: s.layout.mode, nodes: v.stage?.nodes.length },
        diagnostics: s.chartType === "compound" ? c.diagnostics : [],
        inspection: { job: job.current },
      },
    };
  };
  const run = async (instruction: DomainInstruction): Promise<{ ok: boolean; message: string }> => {
    const { state: s, viewport: v, compound: c, timeline: t } = current.current;
    const unavailable = domainAvailability(getDomainCommand(instruction.family, instruction.action), {
      dag: s.dag,
      chartType: s.chartType,
    });
    if (unavailable) throw new Error(unavailable);
    validateRuntimeInstruction(instruction, s.chartType, getEnvironment());
    const { action, args } = instruction;
    if (instruction.family === "history") {
      dispatch({ type: action === "undo" ? "undoRequested" : "redoRequested" });
      return { ok: true, message: `${action} completed.` };
    }
    if (instruction.family === "view") {
      if (action === "types") v.changeTypeFilter(args as unknown as TypeFilter);
      if (action === "navigate") {
        if (args.destination === "back") v.back();
        else if (args.destination === "up") v.up();
        else v.showAll();
      }
      if (action === "zoom") {
        if (args.fit) v.zoom.zoomFit();
        else v.zoom.setZoomPercent(args.percent as number);
      }
      if (action === "chart") dispatch({ type: "chartTypeChanged", chartType: args.chart as GraphChartType });
      if (action === "select") {
        const ids = args.ids as string[];
        dispatch({
          type: "selectionChanged",
          selection:
            ids.length === 0
              ? { type: "full" }
              : ids.length === 1
                ? { type: "node", key: ids[0] }
                : { type: "forest", keys: ids, label: "AI selection" },
          pushHistory: true,
        });
      }
      if (action === "set") v.spatialView.change(args.patch as Partial<SpaceView>);
      if (action === "group") {
        const id = args.id as string | null;
        v.compound.setView({
          ...v.compound.view,
          ...(args.focus !== undefined ? { focusGroupId: args.focus ? id : null } : {}),
          ...(id && args.collapsed !== undefined
            ? {
                collapsedGroupIds: args.collapsed
                  ? [...new Set([...v.compound.view.collapsedGroupIds, id])]
                  : v.compound.view.collapsedGroupIds.filter((key) => key !== id),
              }
            : {}),
        });
      }
      if (action === "timeline") {
        if (args.track !== undefined) v.changeTrack((args.track as string | null) ?? "");
        if (args.range !== undefined) v.changeTimelineRange(args.range as { start: number; end: number } | null);
      }
      return { ok: true, message: "View updated. Document coordinates and times are unchanged." };
    }
    if (action === "cancel") {
      if (s.chartType === "compound") c.cancel();
      else t.cancel();
      if (job.current?.status === "running") {
        job.current.status = "cancelled";
        job.current.message = "Cancelled.";
      }
      return { ok: true, message: `Cancelled ${job.current?.id ?? "current layout task"}.` };
    }
    if (job.current?.status === "running") throw new Error(`Task ${job.current.id} is still running.`);
    const task: RuntimeJob = {
      id: `layout-${s.document.generation}-${++sequence.current}`,
      status: "running",
      message: "Running",
    };
    job.current = task;
    report("info", `${task.id}: running`);
    try {
      let result: { ok: boolean; message: string };
      if (s.chartType === "node-link") {
        dispatch({ type: "layoutModeChanged", mode: args.method as "level" | "sugiyama" | "dagre" });
        result = { ok: true, message: `Layout configuration applied: ${args.method}.` };
      } else if (s.chartType === "compound") {
        result =
          action === "resume"
            ? await c.resume()
            : args.intent !== undefined
              ? await c.propose(args.intent)
              : await c.generate(args.prompt as string);
      } else if (s.chartType === "timeline") {
        if (args.method === "algorithm") {
          t.setMode("algorithm");
          result = { ok: true, message: "Timeline algorithm configuration applied." };
        } else result = await t.generate(args.prompt as string);
      } else throw new Error(`Layout run is unavailable for ${s.chartType}.`);
      if (task.status === "cancelled") result = { ok: false, message: "Cancelled." };
      task.status = result.ok ? "completed" : /cancel|changed/i.test(result.message) ? "cancelled" : "failed";
      task.message = result.message;
      return { ok: result.ok, message: `${task.id}: ${task.status}. ${result.message}` };
    } catch (error) {
      task.status = "failed";
      task.message = error instanceof Error ? error.message : "Layout failed.";
      return { ok: false, message: `${task.id}: failed. ${task.message}` };
    }
  };
  return { getEnvironment, run };
}
