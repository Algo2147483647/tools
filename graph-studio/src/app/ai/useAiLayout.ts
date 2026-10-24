import { type Dispatch, useCallback, useEffect, useRef, useState } from "react";
import { requestAiPlan } from "../../ai/transport/providers";
import type { AiHarnessState, AiSettings } from "../../ai/types";
import { runLayoutWorkflow } from "../../layout/compound/ai/workflow";
import { formatLayoutFeedback } from "../../layout/compound/feedback";
import type { LayoutIntent } from "../../layout/compound/layout-plan";
import type { CompoundLayoutController } from "../layout/useCompoundLayoutPlan";
import type { ConsoleController } from "../console/useConsoleController";

import type { MutableRefObject, SetStateAction } from "react";
import type { AiContextPacket, AiResponse } from "../../ai/types";
export function useAiLayout({
  compoundLayout,
  settings,
  appendMessage,
  requestGeneration,
  requestAbort,
  busyRef,
  setBusy,
}: {
  compoundLayout?: CompoundLayoutController;
  settings: AiSettings;
  appendMessage: ConsoleController["appendMessage"];
  requestGeneration: MutableRefObject<number>;
  requestAbort: MutableRefObject<AbortController | null>;
  busyRef: MutableRefObject<boolean>;
  setBusy: Dispatch<SetStateAction<boolean>>;
}) {
  const [layoutBusy, setLayoutBusy] = useState(false);
  const [layoutMessage, setLayoutMessage] = useState("");
  const [layoutExplanation, setLayoutExplanation] = useState("");
  const layoutActive = useRef(false);
  const layoutRequestKey = useRef<string>();

  const cancelLayout = useCallback(() => {
    if (!layoutActive.current) return;
    layoutActive.current = false;
    requestGeneration.current++;
    requestAbort.current?.abort();
    compoundLayout?.cancel();
    busyRef.current = false;
    setBusy(false);
    setLayoutBusy(false);
    setLayoutMessage("Layout request cancelled. The graph is unchanged.");
  }, [compoundLayout?.cancel]);
  useEffect(() => {
    if (layoutActive.current && layoutRequestKey.current === compoundLayout?.key) return;
    cancelLayout();
    setLayoutMessage("");
    setLayoutExplanation("");
  }, [compoundLayout?.key, cancelLayout]);

  async function handleResponse({
    response,
    panelIntent,
    context,
    message,
    signal,
    isCurrent,
    next,
  }: {
    response: AiResponse;
    panelIntent?: LayoutIntent;
    context: AiContextPacket;
    message: string;
    signal: AbortSignal;
    isCurrent: () => boolean;
    next: AiHarnessState;
  }) {
    if (!compoundLayout?.ready)
      throw new Error("Open a rendered Nested node-link chart before requesting layout changes.");
    layoutActive.current = true;
    layoutRequestKey.current = compoundLayout.key;
    setLayoutBusy(true);
    const outcome = await runLayoutWorkflow({
      response,
      panelIntent: panelIntent,
      inspect: compoundLayout.inspect,
      isCurrent,
      onProgress: setLayoutMessage,
      evaluate: async (intent, retainBest) => {
        await compoundLayout.propose(intent, false, { background: true, retainBest });
        if (!isCurrent()) throw new Error("Layout context changed.");
        const feedback = compoundLayout.getFeedback();
        if (!feedback) throw new Error("No layout evaluation is available.");
        return feedback;
      },
      ask: (feedback) =>
        requestAiPlan({
          settings,
          context: { ...context, compoundLayout: { ...context.compoundLayout, feedback } },
          message,
          signal,
        }),
    });
    if (!isCurrent()) return;
    // End the request before a commit changes its graph revision.
    layoutActive.current = false;
    const applied = outcome.feedback
      ? compoundLayout.finishAi(!panelIntent && outcome.allowAutoApply && settings.executionMode === "auto-edit")
      : false;
    const detail = [
      applied ? "Layout applied. Undo restores the previous layout." : "",
      outcome.feedback ? formatLayoutFeedback(outcome.feedback) : outcome.explanation,
    ]
      .filter(Boolean)
      .join("\n");
    setLayoutMessage(detail);
    setLayoutExplanation(outcome.explanation);
    if (outcome.explanation) appendMessage("ai", outcome.explanation);
    appendMessage("ai-action", detail);
    return next;
  }
  return {
    layoutBusy,
    layoutMessage,
    layoutExplanation,
    layoutActive,
    layoutRequestKey,
    setLayoutBusy,
    setLayoutMessage,
    setLayoutExplanation,
    cancelLayout,
    handleResponse,
  };
}
