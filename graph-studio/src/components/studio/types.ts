import type { AiController } from "../../controllers/useAiController";
import type { CompoundLayoutController } from "../../controllers/useCompoundLayoutPlan";
import type { ConsoleController } from "../../controllers/useConsoleController";
import type { DocumentSessionController } from "../../controllers/useDocumentSession";
import type { GraphTransactionsController } from "../../controllers/useGraphTransactions";
import type { GraphViewportController } from "../../controllers/useGraphViewport";
import type { NodeActionsController } from "../../controllers/useNodeActions";
import type { PreferencesController } from "../../controllers/usePreferencesController";
import type { StudioUiController } from "../../controllers/useStudioUi";
import type { TimelineLayoutController } from "../../controllers/useTimelineLayout";
import type { WorkspaceControls } from "../../controllers/workspaceControls";


export interface StudioViewProps {
  session: DocumentSessionController;
  preferences: PreferencesController;
  ui: StudioUiController;
  files: WorkspaceControls;
  onInitializeCanvas(): void;
  transactions: GraphTransactionsController;
  consoleController: ConsoleController;
  ai: AiController;
  compoundLayoutPlan: CompoundLayoutController;
  timelineLayoutPlan: TimelineLayoutController;
  viewport: GraphViewportController;
  nodeActions: NodeActionsController;
}
