import { useCallback, useRef, useState } from "react";
import StudioView from "./components/studio/StudioView";
import { useConsoleRuntime } from "./app/console/useConsoleRuntime";
import type { ConsoleEnvironment } from "./console/runtime";
import type { DomainInstruction } from "./console/domainRegistry";
import { useAiController } from "./app/ai/useAiController";
import { useCompoundLayoutPlan } from "./app/layout/useCompoundLayoutPlan";
import { useConsoleController } from "./app/console/useConsoleController";
import { useDocumentSession } from "./app/document/useDocumentSession";
import { useGraphTransactions } from "./app/document/useGraphTransactions";
import { useGraphViewport } from "./app/viewport/useGraphViewport";
import { usePreferencesController } from "./app/preferences/usePreferencesController";
import { useStudioShortcuts } from "./app/ui/useStudioShortcuts";
import { useStudioUi } from "./app/ui/useStudioUi";
import { useTimelineLayout } from "./app/layout/useTimelineLayout";
import { useWorkspaceController } from "./app/workspace/useWorkspaceController";
import { loadGraphPagePreferences } from "./app/preferences/preferences";

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
  const runtimeRef = useRef<{
    getEnvironment: () => ConsoleEnvironment;
    run: (instruction: DomainInstruction) => Promise<{ ok: boolean; message: string }>;
  }>({
    getEnvironment: () => ({}),
    run: async () => ({ ok: false, message: "Runtime not ready." }),
  });
  const getEnvironment = useCallback(() => runtimeRef.current.getEnvironment(), []);
  const runRuntime = useCallback((instruction: DomainInstruction) => runtimeRef.current.run(instruction), []);
  const consoleController = useConsoleController({
    state,
    appearance,
    transactions,
    commitAppearance: charts.commitAppearance,
    openNodeDetail: ui.openNodeDetail,
    getEnvironment,
    runRuntime,
  });
  const viewport = useGraphViewport(
    {
      state,
      dispatch,
      homeVisible: files.homeVisible,
      showNodeDetail: charts.showNodeDetail,
      alignNodeWidthsToMax: charts.alignNodeWidthsToMax,
      openNodeDetail: ui.openNodeDetail,
    },
    appearance,
  );
  const compoundLayoutPlan = useCompoundLayoutPlan(state, dispatch, viewport, preferences.aiSettings);
  const timelineLayoutPlan = useTimelineLayout(state, dispatch, preferences.aiSettings, viewport);
  const consoleRuntime = useConsoleRuntime(
    state,
    dispatch,
    charts.chartStyles[state.chartType].style,
    viewport,
    compoundLayoutPlan,
    timelineLayoutPlan,
    consoleController.appendMessage,
  );
  runtimeRef.current = consoleRuntime;
  const ai = useAiController({
    state,
    dispatch,
    appearance,
    settings: preferences.aiSettings,
    consoleController,
  });
  useStudioShortcuts(
    {
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
    />
  );
}
