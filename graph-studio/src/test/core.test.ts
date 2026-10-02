import { aiHarnessSuite } from "./aiHarness.test";
import { appearanceSuite } from "./appearance.test";
import { consoleSuite } from "./console.test";
import { fieldRolesSuite } from "./fieldRoles.test";
import { graphSuite } from "./graph.test";
import { importMergeSuite } from "./importMerge.test";
import { runSuites } from "./harness";
import { stateSuite } from "./state.test";
import { workspaceSuite } from "./workspace.test";
import { sankeySuite } from "./sankey.test";
import { examplesSuite } from "./examples.test";
import { chartTypesSuite } from "./chartTypes.test";

async function main() {
  const { passed, failed } = await runSuites([
    aiHarnessSuite,
    appearanceSuite,
    chartTypesSuite,
    graphSuite,
    importMergeSuite,
    consoleSuite,
    fieldRolesSuite,
    stateSuite,
    workspaceSuite,
    sankeySuite,
    examplesSuite,
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
