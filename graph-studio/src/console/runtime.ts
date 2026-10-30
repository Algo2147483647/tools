import { normalizeOrientation } from "../viewport/camera/quaternion";
import type { ChartStyle } from "../schema/appearance/types";
import type { CompoundView, GraphChartType } from "../graph/types";
import type { SpaceView } from "../graph/space";
import type { DomainInstruction } from "./domainRegistry";
import { numberArg, textArg } from "./domains";
import { isRecord } from "../shared/json";
import { parseLayoutIntent } from "../graph/compound/layoutData";

export interface ConsoleEnvironment {
  inspectLayout?: (scope?: string) => unknown;
  style?: ChartStyle;
  referenceTime?: number;
  view?: {
    selection?: unknown;
    focusedKey?: string | null;
    activeType?: string;
    typeFilter?: import("../graph/typeFilter").TypeFilter;
    typeOptions?: string[];
    zoomPercent?: number;
    canBack?: boolean;
    canUp?: boolean;
    canUndo?: boolean;
    canRedo?: boolean;
    activeTrack?: string;
    timelineRange?: unknown;
    compound?: CompoundView;
    spatial?: SpaceView;
  };
  layout?: {
    ready: boolean;
    busy: boolean;
    canResume?: boolean;
    metrics?: unknown;
    diagnostics?: unknown;
    scope?: string;
    inspection?: unknown;
  };
}

/** Validate runtime effects during preparation; invocation occurs only after the full batch passes. */
export function validateRuntimeInstruction(
  instruction: DomainInstruction,
  chart: GraphChartType,
  env: ConsoleEnvironment,
) {
  const { family, action, args } = instruction;
  if (family === "layout") {
    if (!env.layout) throw new Error("Layout service is unavailable.");
    if (action === "inspect" || action === "diagnose") {
      if (args.scope !== undefined) textArg(args.scope, "scope");
      return;
    }
    if (action === "cancel") return;
    if (!env.layout.ready) throw new Error("Layout is not ready. Wait for the current view to finish loading.");
    if (env.layout.busy) throw new Error("A layout task is already running. Cancel it first.");
    if (action === "resume") {
      if (!env.layout.canResume) throw new Error("No current layout checkpoint is available.");
      return;
    }
    if (chart === "node-link") {
      if (
        !["level", "sugiyama", "dagre"].includes(String(args.method)) ||
        args.prompt !== undefined ||
        args.intent !== undefined
      )
        throw new Error('Node-link layout expects {"method":"level|sugiyama|dagre"}.');
    } else if (chart === "timeline") {
      if (
        args.intent !== undefined ||
        (args.method === "algorithm" ? args.prompt !== undefined : args.method !== undefined || !args.prompt)
      )
        throw new Error('Timeline layout expects {"method":"algorithm"} or {"prompt":"..."}.');
      if (args.prompt !== undefined) textArg(args.prompt, "prompt");
    } else if (chart === "compound") {
      if (args.method !== undefined || (args.intent === undefined) === (args.prompt === undefined))
        throw new Error("Compound layout expects exactly one of prompt or intent.");
      if (args.intent !== undefined) parseLayoutIntent(args.intent);
      if (args.prompt !== undefined) textArg(args.prompt, "prompt");
    } else throw new Error(`No layout runner for ${chart}.`);
    return;
  }
  if (!env.view) throw new Error("View service is unavailable.");
  if (family === "history") {
    if (action === "undo" ? !env.view.canUndo : !env.view.canRedo) throw new Error(`Nothing to ${action}.`);
    return;
  }
  if (action === "types") {
    const values = args.values as string[];
    if (args.selection === "single" && values.length > 1) throw new Error("Single selection allows at most one type.");
    if (values.some((value) => !env.view?.typeOptions?.includes(value)))
      throw new Error("Unknown type. Inspect the view's typeOptions first.");
  }
  if (
    action === "navigate" &&
    ((args.destination === "back" && !env.view.canBack) || (args.destination === "up" && !env.view.canUp))
  )
    throw new Error("Navigation target is unavailable.");
  if (action === "zoom" && (args.percent === undefined) === (args.fit === undefined))
    throw new Error("Provide exactly one of percent or fit:true.");
  if (action === "set") {
    if (!isRecord(args.patch) || !Object.keys(args.patch).length) throw new Error("patch must be a non-empty object.");
    const allowed = ["axes", "projection", "orientation", "labels", "grid", "hideBackPoints", "unitScale"];
    for (const [key, value] of Object.entries(args.patch)) {
      if (!allowed.includes(key)) throw new Error(`Unknown Spatial view field ${key}.`);
      if (["labels", "grid", "hideBackPoints"].includes(key) && typeof value !== "boolean")
        throw new Error(`${key} must be boolean.`);
      if (key === "projection" && !["orthographic", "perspective", "map"].includes(String(value)))
        throw new Error("Invalid projection.");
      if (key === "unitScale") numberArg(value, key);
      if (key === "orientation") {
        if (!Array.isArray(value)) throw new Error("orientation must be [x,y,z,w].");
        normalizeOrientation(value);
      }
      if (key === "unitScale" && ((value as number) < 0.1 || (value as number) > 100))
        throw new Error("unitScale must be within 0.1..100.");
      if (
        key === "axes" &&
        (!Array.isArray(value) ||
          value.length !== 3 ||
          value.some((v) => !Number.isSafeInteger(v) || v < 0) ||
          new Set(value).size !== 3)
      )
        throw new Error("axes must contain three distinct non-negative integer indices.");
    }
  } else if (action === "group") {
    if (args.id !== null) textArg(args.id, "id");
    if (args.collapsed === undefined && args.focus === undefined) throw new Error("Provide collapsed or focus.");
    for (const key of ["collapsed", "focus"])
      if (args[key] !== undefined && typeof args[key] !== "boolean") throw new Error(`${key} must be boolean.`);
    if (args.id === null && (args.focus !== true || args.collapsed !== undefined))
      throw new Error("Root only supports focus:true.");
  } else if (action === "timeline") {
    if (!("track" in args) && !("range" in args)) throw new Error("Provide track or range.");
    if (args.track !== undefined && args.track !== null && typeof args.track !== "string")
      throw new Error("track must be a string or null.");
    if (args.range !== undefined && args.range !== null) {
      if (!isRecord(args.range) || Object.keys(args.range).some((k) => !["start", "end"].includes(k)))
        throw new Error("range must contain start and end.");
      if (numberArg(args.range.end, "end") < numberArg(args.range.start, "start"))
        throw new Error("Range end precedes start.");
    }
  }
}
