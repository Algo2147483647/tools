const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(url);
    const result = await page.evaluate(async () => {
      const { normalizeDagInput } = await import("/src/graph/normalize.ts");
      const { emptyLayoutData } = await import("/src/graph/compound/layoutData.ts");
      const { getDefaultChartStyle } = await import("/src/schema/appearance/styles.ts");
      const { getStageAppearance } = await import("/src/layout/shared/appearance.ts");
      const { computeCompoundStage } = await import("/src/app/layout/computeCompoundStage.ts");
      const OriginalWorker = window.Worker;
      const jobs = [];
      let terminated = 0;
      let cancelOnStart = null;
      window.Worker = class extends OriginalWorker {
        constructor(url, options) {
          super(url, options);
          this.target = String(url);
        }
        postMessage(payload) {
          jobs.push({
            target: this.target,
            placement: "placement" in payload.payload,
            boxes: Object.keys(payload.payload.problem?.baseline.boxes ?? {}).length,
          });
          // An unrelated old reply must never settle the current request.
          this.dispatchEvent(
            new MessageEvent("message", { data: { jobId: "stale", ok: false, error: "stale response" } }),
          );
          super.postMessage(payload);
          if (cancelOnStart) queueMicrotask(cancelOnStart);
        }
        terminate() {
          terminated++;
          return super.terminate();
        }
      };
      try {
        const dag = normalizeDagInput({
          format: "graph-studio",
          version: 3,
          nodes: {
            g: { title: "Service group\nDetails" },
            a: { title: "Alpha" },
            b: { title: "Beta" },
            x: { title: "Outside" },
          },
          hierarchy_edges: [
            { id: "ha", source: "g", target: "a" },
            { id: "hb", source: "g", target: "b" },
          ],
          edges: [
            { id: "ab", source: "a", target: "b", value: "call" },
            { id: "bx", source: "b", target: "x", value: "response" },
          ],
        });
        const input = {
          dag,
          view: { collapsedGroupIds: [], focusGroupId: null },
          layout: { ...emptyLayoutData(), method: "fcose" },
          appearance: getStageAppearance(getDefaultChartStyle("compound").appearance, "compound"),
          showNodeDetail: true,
          alignNodeWidthsToMax: false,
          showEdgeLabels: true,
        };
        const stage = await computeCompoundStage(input, new AbortController().signal);
        const firstJobs = jobs.slice();
        const again = await computeCompoundStage(input, new AbortController().signal);
        const cached = jobs.length === firstJobs.length && JSON.stringify(stage.nodes) === JSON.stringify(again.nodes);
        const renamed = {
          ...input,
          dag: { ...dag, nodes: { ...dag.nodes, a: { ...dag.nodes.a, title: "A much wider measured title" } } },
        };
        await computeCompoundStage(renamed, new AbortController().signal);
        const invalidated = jobs.length === firstJobs.length + 1;
        const abort = new AbortController();
        cancelOnStart = () => abort.abort();
        const task = computeCompoundStage({ ...input, showEdgeLabels: false }, abort.signal).then(
          () => false,
          (e) => /cancelled/i.test(e.message),
        );

        const cancelled = await task;
        const finalCount = jobs.length;
        const timings = stage.layoutQuality.timings;
        return {
          firstJobs,
          cached,
          invalidated,
          cancelled,
          terminated,
          finalCount,
          valid: stage.layoutQuality.validation.valid,
          timings,
          method: stage.layoutProvenance.method,
        };
      } finally {
        window.Worker = OriginalWorker;
      }
    });
    assert.equal(result.valid, true);
    assert.equal(result.method, "fcose");
    assert.equal(result.firstJobs.length, 1);
    assert.ok(result.firstJobs[0].target.includes("fcose.worker"));
    assert.equal(result.firstJobs[0].placement, false);
    assert.equal(result.firstJobs[0].boxes, 0);
    assert.ok(result.cached && result.invalidated && result.cancelled);
    assert.equal(result.terminated, result.finalCount);
    assert.equal(result.finalCount, 3);
    assert.ok(result.timings.measurementMs >= 0 && result.timings.layoutMs >= 0 && result.timings.routingMs >= 0);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify(result, null, 2));
    console.log("PASS real worker, isolated chain, stale replies, cancellation, cache, measurement invalidation");
    const ui = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    ui.on("pageerror", (e) => errors.push(e.message));
    const requests = [];
    ui.on("request", (r) => requests.push(r.url()));
    await ui.addInitScript(() => {
      const OriginalWorker = window.Worker;
      window.fcoseTest = { fail: false, hold: false, started: 0, terminated: 0 };
      window.Worker = class extends OriginalWorker {
        constructor(url, options) {
          super(url, options);
          this.fcose = String(url).includes("fcose.worker");
        }
        postMessage(payload) {
          if (this.fcose) {
            window.fcoseTest.started++;
            if (window.fcoseTest.hold) return;
            if (window.fcoseTest.fail) {
              queueMicrotask(() =>
                this.dispatchEvent(
                  new MessageEvent("message", {
                    data: { jobId: payload.jobId, ok: false, error: "Fixture: edge ab has no legal route" },
                  }),
                ),
              );
              return;
            }
          }
          super.postMessage(payload);
        }
        terminate() {
          if (this.fcose) window.fcoseTest.terminated++;
          return super.terminate();
        }
      };
    });
    await ui.goto(url);
    await ui
      .locator("input[type=file]")
      .first()
      .setInputFiles({
        name: "fcose-ui.json",
        mimeType: "application/json",
        buffer: Buffer.from(
          JSON.stringify({
            format: "graph-studio",
            version: 3,
            nodes: {
              g: { title: "Service group" },
              a: { title: "Alpha" },
              b: { title: "Beta" },
              x: { title: "External service" },
            },
            hierarchy_edges: [
              { id: "ha", source: "g", target: "a" },
              { id: "hb", source: "g", target: "b" },
            ],
            edges: [
              { id: "ab", source: "a", target: "b" },
              { id: "bx", source: "b", target: "x" },
            ],
          }),
        ),
      });
    await ui.locator("#settings-btn").click();
    await ui
      .getByRole("navigation", { name: "Settings sections" })
      .getByRole("button", { name: "Chart type", exact: true })
      .click();
    await ui.getByRole("button", { name: /^Nested node-link/ }).click();
    await ui.getByRole("button", { name: "Close settings", exact: true }).click();
    await ui.locator("#chart-tools-toggle").click();
    const controls = ui.getByRole("tablist", { name: "Chart controls", exact: true });
    await controls.getByRole("tab", { name: "Structure", exact: true }).click();
    await ui.getByRole("button", { name: "Expand all", exact: true }).click();
    await controls.getByRole("tab", { name: "Layout", exact: true }).click();
    const tabs = ui.getByRole("tablist", { name: "Nested layout method" });
    const ready = async () => {
      await ui.waitForFunction(() => {
        const text = document.querySelector(".layout-quality")?.textContent ?? "";
        return (
          text.includes("Geometry valid") &&
          !text.includes("Arranging…") &&
          !document.querySelector(".layout-quality [role=alert]")
        );
      });
    };
    const geometry = () =>
      ui
        .locator("svg.dag-graph")
        .evaluate((svg) =>
          [...svg.querySelectorAll(".dag-node, .dag-group-background, .dag-edge path")].map((el) => [
            el.getAttribute("data-key"),
            el.getAttribute("transform"),
            el.getAttribute("x"),
            el.getAttribute("y"),
            el.getAttribute("width"),
            el.getAttribute("height"),
            el.getAttribute("d"),
          ]),
        );
    await ready();
    await ui.getByLabel("Layout direction", { exact: true }).selectOption("RIGHT");
    await ready();
    await tabs.getByRole("tab", { name: /^AI/ }).click();
    await ui.getByLabel("Layout direction", { exact: true }).selectOption("DOWN");
    await ready();
    assert.ok(!requests.some((r) => /cytoscape|fcose\/solver|fcose\.worker/.test(r)), "old modes must not load fCoSE");
    await tabs.getByRole("tab", { name: "fCoSE", exact: true }).click();
    await ready();
    assert.equal(await ui.getByLabel("Layout direction", { exact: true }).count(), 0);
    const successful = await geometry();
    assert.ok(successful.length >= 4);
    await ui.evaluate(() => (window.fcoseTest.fail = true));
    await ui.getByLabel("Layout objective", { exact: true }).selectOption("compact");
    await ui.getByRole("alert").filter({ hasText: "edge ab has no legal route" }).waitFor();
    assert.deepEqual(await geometry(), successful, "failed routing preserves the complete old drawing");
    await tabs.getByRole("tab", { name: "Automatic", exact: true }).click();
    await ready();
    assert.equal(await ui.getByLabel("Layout direction", { exact: true }).inputValue(), "RIGHT");
    await ui.evaluate(() => {
      window.fcoseTest.fail = false;
      window.fcoseTest.hold = true;
    });
    const before = await ui.evaluate(() => window.fcoseTest.started);
    await tabs.getByRole("tab", { name: "fCoSE", exact: true }).click();
    await ui.waitForFunction((n) => window.fcoseTest.started > n, before);
    await tabs.getByRole("tab", { name: "Automatic", exact: true }).click();
    await ready();
    await ui.waitForFunction(() => window.fcoseTest.started === window.fcoseTest.terminated);
    await ui.evaluate(() => (window.fcoseTest.hold = false));
    await tabs.getByRole("tab", { name: /^AI/ }).click();
    await ready();
    assert.equal(await ui.getByLabel("Layout direction", { exact: true }).inputValue(), "DOWN");
    await tabs.getByRole("tab", { name: "fCoSE", exact: true }).click();
    await ready();
    assert.equal(await ui.getByLabel("Layout objective", { exact: true }).inputValue(), "compact");
    await ui.screenshot({ path: "test-results/fcose-ui.png", fullPage: true });
    assert.deepEqual(errors, []);
    console.log(
      "PASS UI modes, lazy loading, per-mode settings, failure preserves drawing, switch cancels worker, successful recovery",
    );
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
