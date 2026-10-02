import assert from "node:assert/strict";
import { createInitialAiHarnessState, createTurnId, installPlan } from "../ai/harness";
import { buildAiHarnessStorageKey, parsePersistedAiHarnessState } from "../ai/persistence";
import { createPlanFromAiResponse } from "../ai/plans";
import { referencesPreviousWork } from "../ai/presentation";
import { parseAiResponse } from "../ai/responseParser";
import { validateCommandBatch } from "../ai/validation";
import { DEFAULT_GRAPH_APPEARANCE } from "../graph/appearance";
import { createSampleDag } from "./fixtures";
import { defineSuite, defineTest } from "./harness";

export const aiHarnessSuite = defineSuite("ai harness", [
  defineTest("detects requests that should continue a previous plan", () => {
    assert.equal(referencesPreviousWork("Based on your previous analysis, complete the changes."), true);
    assert.equal(referencesPreviousWork("Continue from the plan above and apply it."), true);
    assert.equal(referencesPreviousWork("What does Group mean?"), false);
  }),

  defineTest("parses AI JSON responses wrapped in a markdown fence", () => {
    const parsed = parseAiResponse(["```json", '{"kind":"answer","answer":"ok"}', "```"].join("\n"));
    assert.deepEqual(parsed, { kind: "answer", answer: "ok" });
  }),

  defineTest("reports invalid AI JSON with command quoting guidance", () => {
    assert.throws(
      () =>
        parseAiResponse(
          '{"kind":"run_console","answer":"x","commandBatch":{"commands":["/set Water define "2H2 + O2 -> 2H2O""]}}',
        ),
      /Command strings must escape nested double quotes/,
    );
  }),

  defineTest("creates an active plan with a pending command batch from proposed changes", () => {
    const harness = createInitialAiHarnessState("review");
    const turnId = createTurnId();
    const plan = createPlanFromAiResponse({
      harness,
      turnId,
      userMessage: "Improve the group theory chain.",
      response: {
        kind: "propose_changes",
        answer: "I will add core group-theory concepts.",
        plan: {
          title: "Group theory chain cleanup",
          goal: "Add missing intermediate concepts.",
          affectedNodes: ["Group"],
          changes: [
            {
              kind: "add_node",
              target: { nodeId: "Subgroup" },
              rationale: "Subgroups are a core construction in group theory.",
              draftCommands: ["/add Subgroup -p Group", '/set Subgroup title "Subgroup"'],
              risk: "medium",
            },
          ],
        },
      },
    });
    const next = installPlan(harness, plan, turnId);
    assert.equal(next.activePlan?.title, "Group theory chain cleanup");
    assert.deepEqual(next.pendingCommandBatch?.commands, ["/add Subgroup -p Group", '/set Subgroup title "Subgroup"']);
  }),

  defineTest("validates command batches before execution and reports risk", () => {
    const harness = createInitialAiHarnessState("review");
    const turnId = createTurnId();
    const plan = createPlanFromAiResponse({
      harness,
      turnId,
      userMessage: "Add a subgroup concept.",
      response: {
        kind: "run_console",
        answer: "Adding Subgroup under Group.",
        commandBatch: {
          commands: [
            "/add Subgroup -p A",
            '/set Subgroup define "A subset that forms a group under the inherited operation."',
          ],
        },
      },
    });
    assert.ok(plan.commandBatch);
    const validation = validateCommandBatch({
      batch: plan.commandBatch,
      dag: createSampleDag(),
      contextNodeKey: null,
      graphRevision: "0",
    });
    assert.equal(validation.allPassed, true);
    assert.equal(validation.riskLevel, "medium");
    assert.match(validation.summary, /Preflight passed/);
    const diffPreview = validation.results.flatMap((result) => result.expectedDiff || []);
    assert.ok(diffPreview.some((line) => line === "+ Node: Subgroup"));
    assert.ok(diffPreview.some((line) => line === "+ Edge: A -> Subgroup"));
  }),

  defineTest("validates appearance command batches and reports CSS/layout diffs", () => {
    const harness = createInitialAiHarnessState("review");
    const turnId = createTurnId();
    const plan = createPlanFromAiResponse({
      harness,
      turnId,
      userMessage: "Change the graph UI.",
      response: {
        kind: "run_console",
        answer: "Applying a slate UI style.",
        commandBatch: {
          commands: ["/style-preset slate", "/layout rowGap 36", '/style-var --dag-edge "rgba(120, 160, 255, 0.45)"'],
        },
      },
    });
    assert.ok(plan.commandBatch);
    const validation = validateCommandBatch({
      batch: plan.commandBatch,
      dag: createSampleDag(),
      contextNodeKey: null,
      appearance: DEFAULT_GRAPH_APPEARANCE,
      graphRevision: "0",
    });

    assert.equal(validation.allPassed, true);
    assert.equal(validation.riskLevel, "low");
    const diffPreview = validation.results.flatMap((result) => result.expectedDiff || []);
    assert.ok(diffPreview.some((line) => line.includes("layout.rowGap")));
    assert.ok(diffPreview.some((line) => line.includes("cssVars.--dag-edge")));
  }),

  defineTest("parses persisted harness state with active plan and pending batch", () => {
    const harness = createInitialAiHarnessState("review");
    const turnId = createTurnId();
    const plan = createPlanFromAiResponse({
      harness,
      turnId,
      userMessage: "Add a subgroup concept.",
      response: {
        kind: "run_console",
        answer: "Adding Subgroup under Group.",
        commandBatch: {
          commands: ["/add Subgroup -p A"],
        },
      },
    });
    const next = installPlan(harness, plan, turnId);
    const parsed = parsePersistedAiHarnessState(JSON.stringify(next), "ask");
    assert.ok(parsed);
    assert.equal(parsed.mode, "review");
    assert.equal(parsed.activePlan?.title, plan.title);
    assert.deepEqual(parsed.pendingCommandBatch?.commands, ["/add Subgroup -p A"]);
  }),

  defineTest("builds stable per-graph persistence keys", () => {
    assert.equal(buildAiHarnessStorageKey("example.json"), "graph-studio:ai-harness:example.json");
    assert.equal(buildAiHarnessStorageKey("math graph.json"), "graph-studio:ai-harness:math%20graph.json");
  }),
]);
