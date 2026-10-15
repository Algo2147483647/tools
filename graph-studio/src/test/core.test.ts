import { timelineAxisSuite } from "./timelineAxis.test";
import { timelineFlowSuite } from "./timelineFlow.test";
import { timelineViewSuite } from "./timelineView.test";
import { chinaHistorySuite } from "./chinaHistory.test";
import { compoundSuite } from "./compound.test";
import { aiHarnessSuite } from "./aiHarness.test";
import { documentSessionSuite } from "./documentSession.test";
import { appearanceSuite } from "./appearance.test";
import { chartTypesSuite } from "./chartTypes.test";
import { consoleSuite } from "./console.test";
import { examplesSuite } from "./examples.test";
import { fieldRolesSuite } from "./fieldRoles.test";
import { graphSuite } from "./graph.test";
import { runSuites } from "./harness";
import { importMergeSuite } from "./importMerge.test";
import { mathematicsSuite } from "./mathematics.test";
import { sankeySuite } from "./sankey.test";
import { stateSuite } from "./state.test";
import { workspaceSuite } from "./workspace.test";
import { workspaceCreationSuite } from "./workspaceCreation.test";
import { recentStorageSuite } from "./recentStorage.test";
import { timelineSuite } from "./timeline.test";
import { timelineRenderingSuite } from "./timelineRendering.test";
import { spaceHistorySuite } from "./spaceHistory.test";
import { nodeRelationsSuite } from "./nodeRelations.test";

async function main() {
  const { passed, failed } = await runSuites([
    compoundSuite,
    aiHarnessSuite,
    documentSessionSuite,
    appearanceSuite,
    chartTypesSuite,
    graphSuite,
    importMergeSuite,
    consoleSuite,
    fieldRolesSuite,
    stateSuite,
    workspaceSuite,
    workspaceCreationSuite,
    recentStorageSuite,
    sankeySuite,
    examplesSuite,
    mathematicsSuite,
    timelineAxisSuite,
    timelineFlowSuite,
    timelineViewSuite,
    chinaHistorySuite,
    timelineSuite,
    timelineRenderingSuite,
    spaceHistorySuite,
    nodeRelationsSuite,
  ]);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
