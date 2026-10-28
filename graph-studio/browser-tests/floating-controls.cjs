const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";
const output = "test-results/floating-controls";
const fixture = path.resolve(output, "workspace");
fs.mkdirSync(fixture, { recursive: true });
fs.writeFileSync(
  path.join(fixture, "graph.json"),
  JSON.stringify({
    format: "graph-studio",
    version: 3,
    nodes: { a: { title: "Alpha" }, b: { title: "Beta" } },
    edges: [{ id: "ab", source: "a", target: "b" }],
  }),
);

(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  try {
    await page.goto(url);
    await page.locator("input[webkitdirectory]").setInputFiles(fixture);
    const explorer = page.getByRole("complementary", { name: "Workspace explorer" });
    await explorer.waitFor();
    assert.equal(await page.locator(".topbar").count(), 0);
    assert.ok((await explorer.boundingBox()).y < 16);
    await page.getByRole("button", { name: "Hide explorer", exact: true }).click();
    assert.equal(await explorer.locator("footer").count(), 0);
    assert.equal(await page.locator(".explorer-launcher").count(), 0);
    const capsule = page.locator(".studio-launchers");
    const star = page.locator("#studio-launcher");
    const collapsed = await capsule.boundingBox();
    async function reveal() {
      await capsule.hover();
      if (!(await page.locator("#settings-btn").isVisible())) await star.click();
    }
    await reveal();
    const folder = page.getByRole("button", { name: "Workspace files", exact: true });
    const folderBounds = await folder.boundingBox();
    assert.ok(folderBounds.x > 1100 && folderBounds.y < 20);
    const expanded = await capsule.boundingBox();
    assert.equal(expanded.y, collapsed.y);
    assert.ok(Math.abs(expanded.x + expanded.width - collapsed.x - collapsed.width) < 1);
    assert.equal(await page.locator("#studio-launcher-actions").innerText(), "");
    await folder.click();
    await explorer.waitFor();
    await reveal();
    await folder.click();
    await explorer.waitFor({ state: "hidden" });
    await reveal();
    assert.equal(await star.getAttribute("aria-expanded"), "true");
    await page.screenshot({ path: output + "/expanded.png" });
    await page.mouse.move(600, 700);
    await page.locator("#settings-btn").waitFor({ state: "hidden" });
    await star.focus();
    await star.press("ArrowDown");
    await page.waitForFunction(() => document.activeElement.id === "explorer-toggle");
    await page.keyboard.press("Escape");
    assert.equal(await star.getAttribute("aria-expanded"), "false");
    assert.equal(await page.evaluate(() => document.activeElement.id), "studio-launcher");
    await star.press("Enter");
    await page.locator("#settings-btn").click();
    assert.equal(await page.locator("#settings-modal #save-json-btn").count(), 1);
    await page.locator("#save-json-btn").click();
    await page.getByRole("dialog", { name: "Save Graph JSON" }).waitFor();
    assert.equal(await page.locator("#settings-modal").count(), 0);
    const downloadPromise = page.waitForEvent("download");
    await page.locator("#save-json-new").click();
    const download = await downloadPromise;
    const savedPath = await download.path();
    const saved = JSON.parse(fs.readFileSync(savedPath, "utf8"));
    assert.equal(saved.nodes.a.title, "Alpha");

    await page.setViewportSize({ width: 390, height: 700 });
    await reveal();
    await page.locator("#console-toggle").click();
    const toolbar = page.locator(".console-toolbar");
    assert.equal(await toolbar.isVisible(), false);
    await page.getByRole("tab", { name: "Workbench", exact: true }).click();
    await toolbar.waitFor();
    assert.equal(await toolbar.evaluate((el) => el.scrollWidth <= el.clientWidth), true);
    await page.getByRole("button", { name: "Close console", exact: true }).click();
    await reveal();
    await page.screenshot({ path: output + "/mobile.png" });
    assert.deepEqual(errors, []);
    console.log(
      "PASS: in-place icon capsule, explorer toggle, hover/keyboard/Escape, Settings save/download, Workbench-only toolbar, mobile bounds",
    );
  } catch (error) {
    await page.screenshot({ path: output + "/failure.png" });
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
