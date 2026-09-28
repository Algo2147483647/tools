import { aiHarnessSuite } from "./aiHarness.test";
import { appearanceSuite } from "./appearance.test";
import { consoleSuite } from "./console.test";
import { fieldMappingSuite } from "./fieldMapping.test";
import { graphSuite } from "./graph.test";
import { importMergeSuite } from "./importMerge.test";
import { runSuites } from "./harness";
import { stateSuite } from "./state.test";

async function main() {
  const { passed, failed } = await runSuites([
    aiHarnessSuite,
    appearanceSuite,
    graphSuite,
    importMergeSuite,
    consoleSuite,
    fieldMappingSuite,
    stateSuite,
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
