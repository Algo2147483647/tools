import { useCallback,useRef,useState } from "react";
import StudioView from "./components/studio/StudioView";
import { parseCompoundLayoutCommand } from "./console/compoundLayout";
import { useAiController } from "./controllers/useAiController";
import { useCompoundLayoutPlan } from "./controllers/useCompoundLayoutPlan";
import { useConsoleController } from "./controllers/useConsoleController";
import { useDocumentSession } from "./controllers/useDocumentSession";
import { useGraphTransactions } from "./controllers/useGraphTransactions";
import { useGraphViewport } from "./controllers/useGraphViewport";
import { useNodeActions } from "./controllers/useNodeActions";
import { usePreferencesController } from "./controllers/usePreferencesController";
import { useStudioShortcuts } from "./controllers/useStudioShortcuts";
import { useStudioUi } from "./controllers/useStudioUi";
import { useTimelineLayout } from "./controllers/useTimelineLayout";
import { useWorkspaceController } from "./controllers/useWorkspaceController";
import { loadGraphPagePreferences } from "./state/preferences";

export default function App() {
  const [initialPreferences] = useState(loadGraphPagePreferences);
  const session = useDocumentSession(initialPreferences);
  const { state, dispatch } = session;
  const files = useWorkspaceController({ state, dispatch });
  const ui = useStudioUi(dispatch);
  const preferences = usePreferencesController(initialPreferences, state, dispatch);
  const { charts } = preferences;
  const { appearance } = charts;
  const transactions = useGraphTransactions({ state, dispatch, appearanceHistory: charts });
  const layoutCommandRef = useRef<(source: string) => boolean>(() => false);
  const runLayoutCommand = useCallback((source: string) => layoutCommandRef.current(source), []);
  const consoleController = useConsoleController({
    state,
    appearance,
    transactions,
    commitAppearance: charts.commitAppearance,
    openNodeDetail: ui.openNodeDetail,
    runLayoutCommand,
  });
  const viewport = useGraphViewport(
    {
      state,
      dispatch,
      homeVisible: files.homeVisible,
      showNodeDetail: charts.showNodeDetail,
      alignNodeWidthsToMax: charts.alignNodeWidthsToMax,
      closeContextMenu: ui.closeContextMenu,
      openNodeDetail: ui.openNodeDetail,
    },
    appearance,
  );
  const compoundLayoutPlan = useCompoundLayoutPlan(state, dispatch, viewport);
  const timelineLayoutPlan = useTimelineLayout(state, dispatch, preferences.aiSettings, viewport);
  layoutCommandRef.current = (source: string) => {
    try {
      const instruction = parseCompoundLayoutCommand(source);
      if (instruction.type === "propose") {
        void compoundLayoutPlan
          .propose(instruction.intent)
          .then((message) => consoleController.appendMessage("info", message))
          .catch((error) =>
            consoleController.appendMessage("error", error instanceof Error ? error.message : "Layout failed."),
          );
      } else if (instruction.type === "inspect" || instruction.type === "diagnose") {
        consoleController.appendMessage(
          "info",
          JSON.stringify(compoundLayoutPlan.inspect(instruction.groupId), null, 2),
        );
      } else if (instruction.type === "apply") {
        return compoundLayoutPlan.apply(instruction.candidateId);
      } else if (instruction.type === "compare") {
        const candidate = compoundLayoutPlan.review?.result.candidates.find((c) => c.id === instruction.candidateId);
        if (!candidate || compoundLayoutPlan.stale) throw new Error("No current candidate with that ID.");
        consoleController.appendMessage(
          "info",
          JSON.stringify(
            {
              baseline: compoundLayoutPlan.review?.result.baselineMetrics,
              candidate: candidate.metrics,
              movedNodes: candidate.changedNodeIds,
              changedEdges: candidate.changedEdgeIds,
            },
            null,
            2,
          ),
        );
      } else compoundLayoutPlan.dismiss();
      return true;
    } catch (error) {
      consoleController.appendMessage("error", error instanceof Error ? error.message : "Invalid layout command.");
      return false;
    }
  };
  const ai = useAiController({
    state,
    dispatch,
    appearance,
    settings: preferences.aiSettings,
    consoleController,
    compoundLayout: compoundLayoutPlan,
  });
  const nodeActions = useNodeActions(
    { state, dispatch, openNodeDetail: ui.openNodeDetail, closeModals: ui.closeModals },
    transactions,
    viewport,
  );
  useStudioShortcuts(
    {
      contextMenuOpen: Boolean(state.ui.contextMenu),
      closeContextMenu: ui.closeContextMenu,
      closeModals: ui.closeModals,
      requestSave: session.requestSave,
    },
    transactions,
  );
  function initializeCanvas() {
    if (files.prepareNewDocument()) session.initializeCanvas();
  }
  return (
    <StudioView
      session={session}
      files={files}
      ui={ui}
      preferences={preferences}
      onInitializeCanvas={initializeCanvas}
      transactions={transactions}
      consoleController={consoleController}
      ai={ai}
      compoundLayoutPlan={compoundLayoutPlan}
      timelineLayoutPlan={timelineLayoutPlan}
      viewport={viewport}
      nodeActions={nodeActions}
    />
  );
}
