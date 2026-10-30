const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext();
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await context.addInitScript(() => {
    window.calls = [];
    const Native = window.Worker;
    window.Worker = class extends Native {
      postMessage(data, ...args) {
        window.calls.push({ name: "worker", seedOnly: data.payload?.seedOnly });
        if (window.failWorker) {
          queueMicrotask(() => this.onmessage?.({ data: { jobId: data.jobId, ok: false, error: "Fixture failure" } }));
          return;
        }
        super.postMessage(data, ...args);
      }
    };
  });
  await context.route("**/src/**", async (route) => {
    const r = await route.fetch();
    let body = await r.text();
    for (const name of [
      "prepareSpatialModel",
      "projectSpatialModel",
      "solveFlatLayout",
      "arrangeTimelineNodes",
      "prepareCompound",
    ]) {
      body = body.replace(
        new RegExp("(function " + name + "\\([^)]*\\)\\s*\\{)"),
        `$1\n globalThis.calls?.push({name:"${name}"});`,
      );
    }
    await route.fulfill({ response: r, body });
  });
  const run = (name, arg) => page.evaluate(([name, arg]) => window.layoutTest[name](arg), [name, arg]);
  const snapshot = () => run("snapshot");
  const ready = () =>
    page.waitForFunction(() => window.layoutTest?.snapshot().geometry && !window.layoutTest.snapshot().loading);
  const clear = () => page.evaluate(() => window.calls.splice(0));
  try {
    await page.goto(base + "/browser-tests/layout-runtime.html");
    await ready();
    for (const chart of ["node-link", "compound", "timeline", "sankey", "spatial"]) {
      await run("load", chart);
      await ready();
      await page.waitForTimeout(350);
      await run("zoom");
      await page.waitForTimeout(50);
      const before = await snapshot();
      await clear();
      await run("shell");
      await page.waitForTimeout(200);
      await page.evaluate(() => {
        document.fonts.dispatchEvent(new Event("loadingdone"));
        return true;
      });
      await page.waitForTimeout(300);
      const after = await snapshot();
      assert.deepEqual(after.geometry, before.geometry, chart + " shell geometry");
      assert.deepEqual(after.camera, before.camera, chart + " shell camera");
      assert.deepEqual(await clear(), [], chart + " shell does no layout or measurement");
      await run("paint");
      await page.waitForTimeout(300);
      const painted = await snapshot();
      assert.deepEqual(painted.geometry, before.geometry, chart + " paint geometry");
      assert.deepEqual(await clear(), [], chart + " paint does not solve");
      if (chart !== "compound") assert.notDeepEqual(painted.colors, before.colors, chart + " paint applies");
      if (chart === "spatial") {
        await run("orbit");
        await page.waitForTimeout(100);
        assert.notDeepEqual((await snapshot()).geometry, before.geometry);
        const calls = await clear();
        assert.ok(calls.some((c) => c.name === "projectSpatialModel"));
        assert.ok(!calls.some((c) => c.name === "prepareSpatialModel"));
      }
      console.log("PASS", chart, "shell/paint/camera isolation");
    }
    await run("load", "compound");
    await ready();
    await clear();
    await run("collapse", true);
    await ready();
    await page.waitForTimeout(200);
    const folded = await snapshot();
    await clear();
    await run("collapse", false);
    await ready();
    await page.waitForTimeout(200);
    assert.ok(!(await clear()).some((c) => c.name === "worker"), "expanded cache hit");
    await run("collapse", true);
    await ready();
    await page.waitForTimeout(200);
    assert.ok(!(await clear()).some((c) => c.name === "worker"), "folded cache hit");
    assert.deepEqual((await snapshot()).geometry, folded.geometry);
    await run("accept");
    await page.waitForTimeout(300);
    assert.ok(!(await clear()).some((c) => c.name === "worker"), "AI commit does not invoke automatic solve");
    await run("load", "compound");
    await ready();
    const before = await snapshot();
    await clear();
    await page.evaluate(() => (window.failWorker = true));
    await run("height", 30);
    await page.waitForFunction(() => !!window.layoutTest.snapshot().error);
    assert.deepEqual((await snapshot()).geometry, before.geometry, "failed update retains committed geometry");
    await page.evaluate(() => (window.failWorker = false));
    await page.evaluate(() => window.layoutTest.load("compound", true));
    await page.waitForTimeout(400);
    await clear();
    const ai = await snapshot();
    assert.equal(ai.geometry, null);
    assert.equal(ai.prepared, true);
    assert.equal(ai.loading, false);
    await run("seed");
    const calls = await clear();
    assert.equal(calls.filter((c) => c.name === "worker").length, 1);
    assert.equal(calls.find((c) => c.name === "worker").seedOnly, true);
    assert.equal((await snapshot()).geometry, null);
    assert.deepEqual(errors, []);
    console.log("PASS cache reuse, atomic AI acceptance, failed layout retention, explicit AI seed");
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
