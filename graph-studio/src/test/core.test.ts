import { consoleModesSuite } from "./consoleModes.test";
import { simpleRoutingSuite } from "./simpleRouting.test";
import { layoutPersistenceSuite } from "./layoutPersistence.test";
import { styleFilesSuite } from "./styleFiles.test";
import { agiHistorySuite } from "./agiHistory.test";
import { aiHarnessSuite } from "./aiHarness.test";
import { aiTransportSuite } from "./aiTransport.test";
import { appearanceSuite } from "./appearance.test";
import { appearanceContractSuite } from "./appearanceContract.test";
import { chartTypesSuite } from "./chartTypes.test";
import { chinaHistorySuite } from "./chinaHistory.test";
import { compoundSuite } from "./compound.test";
import { compoundLayoutSuite } from "./compoundLayout.test";
import { compoundLayoutPlanSuite } from "./compoundLayoutPlan.test";
import { compoundRoutingSuite } from "./compoundRouting.test";
import { compoundRoutingIntentSuite } from "./compoundRoutingIntent.test";
import { compoundAiHarnessSuite } from "./compoundAiHarness.test";
import { consoleSuite } from "./console.test";
import { documentSessionSuite } from "./documentSession.test";
import { europeHistorySuite } from "./europeHistory.test";
import { examplesSuite } from "./examples.test";
import { fieldRolesSuite } from "./fieldRoles.test";
import { graphSuite } from "./graph.test";
import { runSuites } from "./harness";
import { htmlExportSuite } from "./htmlExport.test";
import { importMergeSuite } from "./importMerge.test";
import { layoutWorkflowSuite } from "./layoutWorkflow.test";
import { mathematicsSuite } from "./mathematics.test";
import { nodeLinkDefaultsSuite } from "./nodeLinkDefaults.test";
import { nodeRelationsSuite } from "./nodeRelations.test";
import { previewSuite } from "./preview.test";
import { recentStorageSuite } from "./recentStorage.test";
import { sankeySuite } from "./sankey.test";
import { scienceHistorySuite } from "./scienceHistory.test";
import { settingsSuite } from "./settings.test";
import { spaceHistorySuite } from "./spaceHistory.test";
import { spatialSuite } from "./spatial.test";
import { stateSuite } from "./state.test";
import { stylePipelineSuite } from "./stylePipeline.test";
import { timelineSuite } from "./timeline.test";
import { timelineAxisSuite } from "./timelineAxis.test";
import { timelineFlowSuite } from "./timelineFlow.test";
import { timelineLayoutSuite } from "./timelineLayout.test";
import { timelinePresetsSuite } from "./timelinePresets.test";
import { timelineRelativeSuite } from "./timelineRelative.test";
import { timelineRenderingSuite } from "./timelineRendering.test";
import { timelineViewSuite } from "./timelineView.test";
import { workspaceSuite } from "./workspace.test";
import { workspaceCreationSuite } from "./workspaceCreation.test";
import { workspaceOperationsSuite } from "./workspaceOperations.test";

async function main() {
  const suites = [
    simpleRoutingSuite,
    consoleModesSuite,
    styleFilesSuite,
    layoutPersistenceSuite,
    appearanceContractSuite,
    timelineLayoutSuite,
    layoutWorkflowSuite,
    compoundLayoutPlanSuite,
    compoundRoutingSuite,
    compoundRoutingIntentSuite,
    compoundAiHarnessSuite,
    spatialSuite,
    stylePipelineSuite,
    compoundSuite,
    compoundLayoutSuite,
    aiHarnessSuite,
    aiTransportSuite,
    documentSessionSuite,
    appearanceSuite,
    previewSuite,
    settingsSuite,
    htmlExportSuite,
    nodeLinkDefaultsSuite,
    timelinePresetsSuite,
    chartTypesSuite,
    graphSuite,
    importMergeSuite,
    consoleSuite,
    fieldRolesSuite,
    stateSuite,
    workspaceSuite,
    workspaceCreationSuite,
    workspaceOperationsSuite,
    recentStorageSuite,
    sankeySuite,
    examplesSuite,
    mathematicsSuite,
    timelineRelativeSuite,
    timelineAxisSuite,
    timelineFlowSuite,
    timelineViewSuite,
    chinaHistorySuite,
    europeHistorySuite,
    timelineSuite,
    timelineRenderingSuite,
    spaceHistorySuite,
    scienceHistorySuite,
    agiHistorySuite,
    nodeRelationsSuite,
  ];
  const filters = process.argv.slice(2).map((filter) => filter.toLowerCase());
  const selected = filters.length
    ? suites.filter((suite) => filters.some((filter) => suite.name.toLowerCase().includes(filter)))
    : suites;
  if (!selected.length) throw new Error(`No test suites matched: ${filters.join(", ")}`);
  const { passed, failed } = await runSuites(selected);

  console.log(`\nSummary: ${passed} passed, ${failed} failed`);
  if (failed > 0) {
    process.exitCode = 1;
  }
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
