import StudioView from "./components/StudioView";
import { useAiController } from "./controllers/useAiController";
import { useAppearanceHistory } from "./controllers/useAppearanceHistory";
import { useConsoleController } from "./controllers/useConsoleController";
import { useDocumentSession } from "./controllers/useDocumentSession";
import { useGraphTransactions } from "./controllers/useGraphTransactions";
import { useGraphViewport } from "./controllers/useGraphViewport";
import { useNodeActions } from "./controllers/useNodeActions";
import { useStudioShortcuts } from "./controllers/useStudioShortcuts";
import { useGraphPreferences } from "./hooks/useGraphPreferences";

export default function App() {
  const session = useDocumentSession();
  const appearanceHistory = useAppearanceHistory(session.preferences.chartStyles, session.state.chartType, session.dispatch);
  const { appearance } = appearanceHistory;
  const transactions = useGraphTransactions({ ...session, appearanceHistory });
  const consoleController = useConsoleController({ ...session, appearance, transactions,
    commitAppearance: appearanceHistory.commitAppearance });
  const ai = useAiController({ ...session, appearance, settings: session.aiSettings, consoleController });
  const viewport = useGraphViewport(session, appearance);
  const nodeActions = useNodeActions(session, transactions);
  useStudioShortcuts(session, transactions);
  useGraphPreferences({ ...session, appearanceByChart: appearanceHistory.appearanceByChart });

  return <StudioView session={session} appearanceHistory={appearanceHistory} transactions={transactions}
    consoleController={consoleController} ai={ai} viewport={viewport} nodeActions={nodeActions} />;
}
