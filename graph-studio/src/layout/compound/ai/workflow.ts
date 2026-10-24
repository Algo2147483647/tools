import type { AiResponse } from "../../../ai/types";
import type { LayoutFeedback } from "../feedback";
import type { LayoutIntent } from "../layout-plan";
import { constrainLayoutProposal } from "./proposalPolicy";

export async function runLayoutWorkflow(options: {
  response: AiResponse;
  panelIntent?: LayoutIntent;
  inspect(scopeId?: string | null): unknown;
  evaluate(intent: LayoutIntent, retainBest: boolean): Promise<LayoutFeedback>;
  ask(feedback: unknown): Promise<AiResponse>;
  isCurrent(): boolean;
  onProgress(message: string): void;
}) {
  let response = options.response;
  let initialIntent: LayoutIntent | undefined;
  let feedback: LayoutFeedback | undefined;
  let explanation = response.answer;
  let feedbackRequestFailed = false;
  for (let turn = 0; turn < 2; turn++) {
    if (!options.isCurrent()) throw new Error("Layout request cancelled or its graph context changed.");
    if (response.kind === "propose_layout") {
      if (options.panelIntent) constrainLayoutProposal(response.intent, options.panelIntent, true);
      if (initialIntent) constrainLayoutProposal(response.intent, initialIntent);
      initialIntent ??= response.intent;
      options.onProgress(turn ? "Checking a refinement…" : "Checking the proposed layout…");
      feedback = await options.evaluate(response.intent, turn > 0);
    } else if (response.kind !== "inspect_layout" && response.kind !== "answer" && response.kind !== "clarify") {
      throw new Error("Arrange accepts layout proposals and inspection only. Use the console for graph edits.");
    }
    if (!options.isCurrent()) throw new Error("Layout request cancelled or its graph context changed.");
    explanation = response.answer;
    if (turn === 1 || response.kind === "answer" || response.kind === "clarify") break;
    options.onProgress("Reviewing measured results…");
    try {
      response = await options.ask({
        inspection: response.kind === "inspect_layout" ? options.inspect(response.scopeId) : undefined,
        evaluation: feedback,
        instruction:
          "Assess measured results. Return answer to finish, or one revised propose_layout. Keep the same scope, objective, locks and movement permissions. If more space or unsupported routing features are needed, explain the limitation; do not expand scope. Never claim an unmeasured improvement.",
      });
    } catch (error) {
      if (!feedback || !options.isCurrent()) throw error;
      explanation = `The feedback request failed. Local results remain available. ${error instanceof Error ? error.message : ""}`;
      feedbackRequestFailed = true;
      break;
    }
  }
  return {
    feedback,
    explanation,
    allowAutoApply: !feedbackRequestFailed && (response.kind === "answer" || response.kind === "propose_layout"),
  };
}
