import { useEffect, useRef, useState, type Dispatch } from "react";
import type { AiSettings } from "../../ai/types";
import { requestToolTurn } from "../../ai/transport/toolConversation";
import { SYSTEM_PROMPT } from "../../ai/protocol/editingPrompt";
import { buildAiContextPacket } from "../../ai/context/packet";
import { modelTools } from "../../ai/tools/catalog";
import { isAnalysisOnlyRequest, runToolLoop } from "../../ai/tools/loop";
import type { GraphAction } from "../document/graphActions";
import type { GraphAppState } from "../document/initialState";
import type { ConsoleController } from "../console/useConsoleController";
import { useAiActivity } from "./useAiActivity";

export function useAiController({
  state,
  dispatch,
  settings,
  consoleController,
}: {
  state: GraphAppState;
  dispatch: Dispatch<GraphAction>;
  settings: AiSettings;
  consoleController: ConsoleController;
}) {
  const [busy, setBusy] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const runningLayout = useRef(false);
  const { activity, onProgress, clear } = useAiActivity();
  const live = useRef({ state, settings, consoleController });
  live.current = { state, settings, consoleController };
  useEffect(() => {
    abort.current?.abort();
    abort.current = null;
    setBusy(false);
    clear();
    return () => {
      abort.current?.abort();
    };
  }, [state.document.generation, clear]);
  const request = async (raw: string) => {
    const message = raw.trim();
    if (!message || abort.current) return;
    consoleController.appendMessage("input", message);
    if (!settings.baseUrl.trim() || !settings.model.trim()) {
      consoleController.appendMessage("error", "Configure an AI provider and model in Settings first.");
      return;
    }
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    clear();
    const readOnly = isAnalysisOnlyRequest(message);
    const snapshot = () =>
      settings !== live.current.settings ? "settings-changed" : live.current.consoleController.getExecutionKey();
    try {
      const context = buildAiContextPacket(
        state,
        consoleController.getEnvironment(),
        consoleController.entries,
        snapshot(),
        readOnly,
      );
      await runToolLoop({
        messages: [{ role: "user", content: JSON.stringify({ context, request: message }) }],
        tools: () => modelTools(live.current.consoleController.capabilityContext, readOnly),
        snapshot,
        signal: controller.signal,
        request: (messages, tools) =>
          requestToolTurn(settings, SYSTEM_PROMPT, messages, tools, controller.signal, onProgress),
        execute: async (name, args) => {
          runningLayout.current = name === "layout_run" || name === "layout_resume";
          try {
            return await live.current.consoleController.runTool(name, args, readOnly, controller.signal);
          } finally {
            runningLayout.current = false;
          }
        },
        onText: (text) => live.current.consoleController.appendMessage("ai", text),
        onCall: (call) => live.current.consoleController.appendMessage("info", `AI tool: ${call.name}`),
      });
    } catch (error) {
      if (live.current.state.document.generation === state.document.generation)
        live.current.consoleController.appendMessage(
          "error",
          error instanceof Error ? error.message : "AI request failed.",
        );
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  };
  const testConnection = async () => {
    if (abort.current) return false;
    const controller = new AbortController();
    abort.current = controller;
    setBusy(true);
    try {
      const reply = await requestToolTurn(
        settings,
        "Call connection_check once with an empty JSON object. Do not edit anything.",
        [{ role: "user", content: "Check native tool calling." }],
        [
          {
            name: "connection_check",
            description: "Verify native tool support; read-only.",
            parameters: { type: "object", properties: {}, required: [], additionalProperties: false },
          },
        ],
        controller.signal,
        onProgress,
      );
      const call = reply.assistant.calls[0];
      if (
        reply.assistant.calls.length !== 1 ||
        call?.name !== "connection_check" ||
        JSON.stringify(JSON.parse(call.arguments)) !== "{}"
      )
        throw new Error("Provider responded but did not return a valid native tool call.");
      if (controller.signal.aborted || live.current.settings !== settings) return false;
      dispatch({ type: "statusChanged", status: `AI native tool connection succeeded for ${settings.model}.` });
      return true;
    } catch (error) {
      if (
        !controller.signal.aborted &&
        live.current.settings === settings &&
        live.current.state.document.generation === state.document.generation
      )
        dispatch({ type: "statusChanged", status: error instanceof Error ? error.message : "AI connection failed." });
      return false;
    } finally {
      if (abort.current === controller) {
        abort.current = null;
        setBusy(false);
      }
    }
  };
  return {
    busy,
    activity,
    request,
    testConnection,
    cancel: () => {
      abort.current?.abort();
      if (runningLayout.current) void live.current.consoleController.cancelLayout();
    },
  };
}
export type AiController = ReturnType<typeof useAiController>;
