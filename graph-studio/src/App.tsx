import { useState } from "react";
import StudioView from "./components/StudioView";
import { useAiController } from "./controllers/useAiController";
import { useConsoleController } from "./controllers/useConsoleController";
import { useDocumentSession } from "./controllers/useDocumentSession";
import { useGraphTransactions } from "./controllers/useGraphTransactions";
import { useGraphViewport } from "./controllers/useGraphViewport";
import { useNodeActions } from "./controllers/useNodeActions";
import { useStudioShortcuts } from "./controllers/useStudioShortcuts";
import { useWorkspaceController } from "./controllers/useWorkspaceController";
import { usePreferencesController } from "./controllers/usePreferencesController";
import { useStudioUi } from "./controllers/useStudioUi";
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
  const consoleController = useConsoleController({
    state,
    appearance,
    transactions,
    commitAppearance: charts.commitAppearance,
    openNodeDetail: ui.openNodeDetail,
  });
  const ai = useAiController({ state, dispatch, appearance, settings: preferences.aiSettings, consoleController });
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
      viewport={viewport}
      nodeActions={nodeActions}
    />
  );
}
