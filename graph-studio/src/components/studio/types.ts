import type { AiController } from "../../app/ai/useAiController";
import type { CompoundLayoutController } from "../../app/layout/useCompoundLayoutPlan";
import type { ConsoleController } from "../../app/console/useConsoleController";
import type { DocumentSessionController } from "../../app/document/useDocumentSession";
import type { GraphTransactionsController } from "../../app/document/useGraphTransactions";
import type { GraphViewportController } from "../../app/viewport/useGraphViewport";
import type { NodeActionsController } from "../../app/document/useNodeActions";
import type { PreferencesController } from "../../app/preferences/usePreferencesController";
import type { StudioUiController } from "../../app/ui/useStudioUi";
import type { TimelineLayoutController } from "../../app/layout/useTimelineLayout";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";

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
