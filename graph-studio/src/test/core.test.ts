import { spatialSuite } from "./spatial.test";
import { compoundLayoutPlanSuite } from "./compoundLayoutPlan.test";
import { compoundRoutingSuite } from "./compoundRouting.test";
import { timelineRelativeSuite } from "./timelineRelative.test";
import { stylePipelineSuite } from "./stylePipeline.test";
import { timelineAxisSuite } from "./timelineAxis.test";
import { timelineFlowSuite } from "./timelineFlow.test";
import { timelineViewSuite } from "./timelineView.test";
import { chinaHistorySuite } from "./chinaHistory.test";
import { europeHistorySuite } from "./europeHistory.test";
import { compoundSuite } from "./compound.test";
import { compoundLayoutSuite } from "./compoundLayout.test";
import { aiHarnessSuite } from "./aiHarness.test";
import { documentSessionSuite } from "./documentSession.test";
import { appearanceSuite } from "./appearance.test";
import { previewSuite } from "./preview.test";
import { settingsSuite } from "./settings.test";
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
import { workspaceOperationsSuite } from "./workspaceOperations.test";
import { recentStorageSuite } from "./recentStorage.test";
import { timelineSuite } from "./timeline.test";
import { timelineRenderingSuite } from "./timelineRendering.test";
import { spaceHistorySuite } from "./spaceHistory.test";
import { scienceHistorySuite } from "./scienceHistory.test";
import { agiHistorySuite } from "./agiHistory.test";
import { nodeRelationsSuite } from "./nodeRelations.test";
import { htmlExportSuite } from "./htmlExport.test";
import { nodeLinkDefaultsSuite } from "./nodeLinkDefaults.test";
import { timelinePresetsSuite } from "./timelinePresets.test";

async function main() {
  const suites = [
    layoutWorkflowSuite,
    compoundLayoutPlanSuite,
    compoundRoutingSuite,
    spatialSuite,
    stylePipelineSuite,
    compoundSuite,
    compoundLayoutSuite,
    aiHarnessSuite,
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
import { layoutWorkflowSuite } from "./layoutWorkflow.test";
