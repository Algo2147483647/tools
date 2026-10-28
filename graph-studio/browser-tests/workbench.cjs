const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";
const doc = {
  format: "graph-studio",
  version: 3,
  nodes: {
    g: { title: "Platform" },
    h: { title: "Services" },
    a: { title: "API", type: "service" },
    b: { title: "Storage", type: "data" },
    x: { title: "Outside", type: "external" },
  },
  edges: [
    { id: "ab", source: "a", target: "b", value: 10 },
    { id: "ax", source: "a", target: "x", value: 5 },
  ],
  hierarchy_edges: [
    { id: "gh", source: "g", target: "h" },
    { id: "ha", source: "h", target: "a" },
    { id: "gb", source: "g", target: "b" },
  ],
};
doc.metadata = { space: { dimensions: 3, coordinateSystem: "cartesian" }, timeline: { clock: { mode: "calendar" } } };
Object.values(doc.nodes).forEach((node, i) => {
  node.space = [i * 10, (i % 2) * 20, i * 5];
  node.time = { at: `2026-10-${20 + i}` };
  node.track = i % 2 ? "Delivery" : "Platform";
});
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const output = "test-results/workbench";
  fs.mkdirSync(output, { recursive: true });
  async function load(data = doc, name = "workbench.json") {
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(JSON.stringify(data)) });
    await page.locator("#chart-tools-toggle").waitFor();
  }
  async function mode(name) {
    await page.locator("#settings-btn").click();
    await page.getByRole("button", { name: "Chart type", exact: true }).click();
    await page
      .locator(".chart-type-grid button")
      .filter({ has: page.locator("strong", { hasText: new RegExp("^" + name + "$") }) })
      .click();
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
  }
  async function workbench() {
    if (!(await page.locator("#chart-tools-panel").count())) await page.locator("#chart-tools-toggle").click();
    return page.locator("#chart-tools-panel");
  }
  async function nodes(keys) {
    await page.waitForFunction(
      (keys) =>
        JSON.stringify(
          [
            ...new Set(
              [...document.querySelectorAll("#main-content .dag-node[data-key]:not(.dag-group-header)")].map((e) =>
                e.getAttribute("data-key"),
              ),
            ),
          ].sort(),
        ) === JSON.stringify(keys.sort()),
      keys,
    );
  }
  try {
    await page.goto(url);
    await load();
    await mode("Nested node-link");
    let panel = await workbench();
    assert.equal(await page.locator('.topbar select[aria-label*="type" i]').count(), 0);
    await panel.getByRole("button", { name: "Expand all", exact: true }).click();
    await nodes(["a", "b", "x"]);
    await panel.getByRole("button", { name: "Collapse h", exact: true }).click();
    await nodes(["b", "h", "x"]);
    await panel.getByRole("button", { name: "Enter g", exact: true }).click();
    await nodes(["b", "h"]);
    await panel.getByRole("button", { name: "Expand h", exact: true }).click();
    await nodes(["a", "b"]);
    await page.locator("#back-btn").click();
    await nodes(["a", "b", "x"]);
    await panel.getByRole("button", { name: "Collapse h", exact: true }).click();
    await panel.getByRole("button", { name: "Enter g", exact: true }).click();
    await nodes(["b", "h"]);
    await page.screenshot({ path: output + "/nested.png" });
    await page.reload();
    await load();
    await mode("Nested node-link");
    panel = await workbench();
    await nodes(["b", "h"]);
    assert.equal(await panel.getByRole("button", { name: "Expand h", exact: true }).count(), 1);
    await panel.getByRole("button", { name: "All", exact: true }).click();
    await panel.getByRole("button", { name: "Expand all", exact: true }).click();
    await panel.getByRole("tab", { name: "Multiple", exact: true }).click();
    await panel.getByRole("checkbox", { name: "service", exact: true }).check();
    await nodes(["a"]);
    await panel.getByRole("checkbox", { name: "data", exact: true }).check();
    await nodes(["a", "b"]);
    await panel.getByRole("button", { name: "Exclude selected", exact: true }).click();
    await nodes(["x"]);
    await panel.getByRole("button", { name: "Invert selection", exact: true }).click();
    await nodes(["a", "b"]);
    await panel.getByRole("button", { name: "Include selected", exact: true }).click();
    await nodes(["x"]);
    await panel.getByRole("button", { name: "Clear selection", exact: true }).click();
    await nodes([]);
    await panel.getByRole("button", { name: "Show all types", exact: true }).click();
    await nodes(["a", "b", "x"]);
    assert.equal(await page.locator("#layout-toggle, #layout-panel").count(), 0);
    await panel.press("Escape");
    assert.equal(await page.locator("#chart-tools-toggle").evaluate((el) => el === document.activeElement), true);
    await page.locator("#settings-btn").click();
    await page.getByRole("button", { name: "Layout", exact: true }).click();
    assert.equal(await page.getByRole("tab", { name: "Automatic", exact: true }).count(), 1);
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
    for (const name of ["Node-link", "Sankey", "Timeline", "Spatial"]) {
      await mode(name);
      panel = await workbench();
      assert.equal(await panel.getByRole("heading", { name: "Types", exact: true }).count(), 1);
      await panel.getByRole("tab", { name: "Single", exact: true }).click();
      await panel.getByRole("radio", { name: "service", exact: true }).check();
      await page.waitForFunction(() =>
        document.querySelector("#chart-tools-panel")?.textContent.includes("Showing 1 selected type"),
      );
      await nodes(["a"]);
      if (name === "Spatial") {
        await panel.getByRole("tab", { name: "Perspective", exact: true }).click();
        assert.equal(
          await panel.getByRole("tab", { name: "Perspective", exact: true }).getAttribute("aria-selected"),
          "true",
        );
      }
      if (name === "Timeline") {
        await panel.getByRole("combobox", { name: "Filter timeline by track" }).selectOption("Platform");
      }
      await panel.getByRole("button", { name: "Show all types", exact: true }).click();
      await page.screenshot({ path: output + "/" + name.toLowerCase() + ".png" });
    }
    await page.setViewportSize({ width: 540, height: 800 });
    await page.screenshot({ path: output + "/narrow.png" });
    const bounds = await panel.boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= 540);
    assert.deepEqual(errors, []);
    console.log(
      "PASS: five mode workbenches, Settings-only Layout, Nested direct controls and isolated focus, include/exclude/invert/empty filters, file reopen cache, Escape focus, narrow viewport",
    );
  } catch (e) {
    await page.screenshot({ path: output + "/failure.png" });
    console.error(await page.locator("body").innerText());
    throw e;
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
