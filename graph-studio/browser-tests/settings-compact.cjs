const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const base = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";
const doc = {
  format: "graph-studio",
  version: 3,
  nodes: {
    a: { title: "API", space: [0, 0, 0], time: { at: "2026-01-01" }, track: "Build" },
    b: { title: "Storage", space: [10, 20, 5], time: { at: "2026-02-01" }, track: "Ship" },
  },
  edges: [{ id: "ab", source: "a", target: "b", value: 10 }],
  metadata: { space: { dimensions: 3, coordinateSystem: "cartesian" }, timeline: { clock: { mode: "calendar" } } },
};
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const out = "test-results/settings-compact";
  fs.mkdirSync(out, { recursive: true });
  const nav = (name) => page.locator(".settings-tabs").getByRole("button", { name, exact: true }).click();
  const group = (name) => page.locator(".appearance-tabs").getByRole("button", { name, exact: true }).click();
  async function fits() {
    assert.deepEqual(
      await page.locator(".numeric-setting").evaluateAll((rows) =>
        rows.flatMap((row) => {
          const r = row.getBoundingClientRect();
          return [...row.querySelectorAll("input, button")]
            .filter((e) => {
              const b = e.getBoundingClientRect();
              return b.width && (b.left < r.left - 1 || b.right > r.right + 1);
            })
            .map((e) => e.getAttribute("aria-label"));
        }),
      ),
      [],
    );
    assert.equal(await page.locator('#settings-modal input[type="range"]').count(), 0);
  }
  try {
    await page.goto(base);
    await page
      .locator('input[type="file"]')
      .first()
      .setInputFiles({ name: "settings.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
    await page.locator(".studio-launchers").hover();
    await page.locator("#settings-btn").click();
    for (const name of ["Node-link", "Nested node-link", "Sankey", "Timeline", "Spatial"]) {
      await nav("Chart type");
      assert.equal(await page.locator(".chart-type-grid small").count(), 0);
      assert.equal(await page.locator(".chart-type-grid button").count(), 5);
      await page.locator(".chart-type-grid").getByRole("button", { name, exact: true }).click();
      await nav("Layout");
      assert.equal(await page.getByLabel("Layout objective", { exact: true }).count(), 0);
      assert.ok(!(await page.locator(".settings-page").innerText()).includes("Optimize for"));
      if (name === "Nested node-link") await page.screenshot({ path: out + "/nested-layout.png" });
      await nav("Appearance");
      for (const tab of ["Nodes", "Edges", "Canvas"]) {
        await group(tab);
        await fits();
      }
      if (name === "Node-link") {
        await group("Nodes");
        const input = page.getByRole("spinbutton", { name: "Node height value", exact: true });
        const original = await input.inputValue(),
          next = String(Number(original) + 13);
        await input.fill(next);
        await input.press("Enter");
        assert.equal(await input.inputValue(), next);
        await page.getByRole("button", { name: "Undo style", exact: true }).click();
        assert.equal(await input.inputValue(), original);
        await page.locator(".settings-footer").getByRole("button", { name: "Redo", exact: true }).click();
        assert.equal(await input.inputValue(), next);
        await input.fill("999");
        await input.press("Escape");
        assert.equal(await input.inputValue(), next);
        assert.equal(await page.locator("#settings-modal").count(), 1);
        await page.getByRole("button", { name: "Reset Node height", exact: true }).click();
        assert.equal(await input.inputValue(), original);
        await page.screenshot({ path: out + "/nodes-desktop.png" });
      }
      console.log("PASS", name, "compact controls and removed objective/ranges");
    }
    await nav("Chart type");
    await page.screenshot({ path: out + "/chart-types-desktop.png" });
    await page.locator(".chart-type-grid").getByRole("button", { name: "Node-link", exact: true }).click();
    for (const width of [900, 390]) {
      await page.setViewportSize({ width, height: 850 });
      await nav("Chart type");
      await page.screenshot({ path: out + `/chart-types-${width}.png` });
      await nav("Appearance");
      await group("Nodes");
      await fits();
      const bounds = await page.locator(".settings-page").evaluate((e) => [e.clientWidth, e.scrollWidth]);
      assert.ok(bounds[1] <= bounds[0] + 1, "settings page must not overflow horizontally");
      await page.screenshot({ path: out + `/nodes-${width}.png` });
    }
    assert.deepEqual(errors, []);
    console.log("PASS numeric commit, Escape, reset, undo/redo and responsive layouts");
  } catch (error) {
    await page.screenshot({ path: out + "/failure.png" });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
