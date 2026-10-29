const assert = require("node:assert/strict");
const fs = require("node:fs");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5182";
const graph = (extra = {}) => ({
  format: "graph-studio",
  version: 3,
  nodes: { A: { title: "Alpha", type: "service" }, B: { title: "Beta", type: "data" } },
  edges: [{ id: "ab", source: "A", target: "B", value: 10 }],
  ...extra,
});
const tool = (name, args = {}, id = name) => ({
  id,
  type: "function",
  function: { name, arguments: JSON.stringify(args) },
});
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const errors = [],
    results = [];
  let lastPage;
  const output = "test-results/ai-tools";
  fs.mkdirSync(output, { recursive: true });
  async function open(doc = graph(), chartType = "node-link") {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(
      (chartType) =>
        localStorage.setItem(
          "graph-studio:page-preferences",
          JSON.stringify({
            chartType,
            consoleSidebarOpen: true,
            aiSettings: {
              provider: "openai-compatible",
              baseUrl: "https://fixture.invalid/v1",
              apiKey: "",
              model: "fixture",
            },
          }),
        ),
      chartType,
    );
    const page = await context.newPage();
    lastPage = page;
    page.on("pageerror", (e) => errors.push(e.message));
    await page.route("https://fixture.invalid/v1/models", (r) => r.fulfill({ json: { data: [{ id: "fixture" }] } }));
    await page.goto(url);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({ name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
    await page.locator("#graph-console-input").waitFor();
    return { context, page };
  }
  async function ask(page, message, turns) {
    let index = 0;
    const packets = [];
    await page.unroute("https://fixture.invalid/v1/chat/completions");
    await page.route("https://fixture.invalid/v1/chat/completions", async (route) => {
      const body = route.request().postDataJSON();
      packets.push(body);
      assert.ok(body.tools.length);
      assert.equal(body.response_format, undefined);
      const next = turns[index++];
      if (!next) return route.fulfill({ status: 500, json: { error: { message: "Unexpected model turn" } } });
      const response = typeof next === "function" ? await next(body) : next;
      await route.fulfill({
        json: {
          choices: [
            {
              message: {
                role: "assistant",
                content: response.text ?? "",
                ...(response.calls ? { tool_calls: response.calls } : {}),
              },
              finish_reason: response.calls ? "tool_calls" : "stop",
            },
          ],
        },
      });
    });
    await page.locator("#graph-console-input").fill(message);
    await page.locator("#graph-console-input").press("Enter");
    await page.waitForFunction(() => !document.querySelector("#graph-console-input").disabled, {}, { timeout: 30000 });
    assert.equal(index, turns.length, await page.locator(".console-terminal__output").innerText());
    return packets;
  }
  function toolResults(body) {
    return body.messages.filter((m) => m.role === "tool").map((m) => JSON.parse(m.content));
  }
  async function settingsAction(page, id) {
    await page.locator(".studio-launchers").hover();
    if (!(await page.locator("#settings-btn").isVisible())) await page.locator("#studio-launcher").click();
    await page.locator("#settings-btn").click();
    await page.locator("#" + id).click();
    await page.getByRole("button", { name: "Close settings", exact: true }).click();
  }
  async function inspectTitle(page, title) {
    await ask(page, "Read A's current title", [
      { calls: [tool("node_inspect", { id: "A", field: "title" })] },
      (body) => {
        const r = toolResults(body).at(-1);
        assert.equal(r.ok, true);
        assert.equal(r.data.queries[0].data.fields.title, title);
        return { text: title };
      },
    ]);
  }
  try {
    {
      const { context, page } = await open();
      const literal = "/node_delete A";
      const packets = await ask(page, literal, [{ text: "Please describe the requested change." }]);
      assert.equal(JSON.parse(packets[0].messages[1].content).request, literal);
      assert.equal(await page.locator(".console-terminal__suggestions").count(), 0);
      await inspectTitle(page, "Alpha");
      await ask(page, "Rename A and show edge labels", [
        {
          calls: [
            tool("edit_batch", {
              operations: [
                { tool: "node_set", arguments: { id: "A", field: "title", value: "Changed" } },
                { tool: "style_set", arguments: { path: "style.appearance.display.showEdgeLabels", value: true } },
              ],
            }),
          ],
        },
        (body) => {
          assert.equal(toolResults(body)[0].effects.graphEdits, 1);
          assert.equal(toolResults(body)[0].effects.styleEdits, 1);
          return { text: "Renamed A and enabled labels." };
        },
      ]);
      await inspectTitle(page, "Changed");
      await settingsAction(page, "undo-btn");
      await inspectTitle(page, "Alpha");
      await settingsAction(page, "redo-btn");
      await inspectTitle(page, "Changed");
      await ask(page, "Use the level layout", [
        { calls: [tool("layout_run", { method: "level" })] },
        (body) => {
          assert.equal(toolResults(body)[0].ok, true);
          return { text: "Level layout applied." };
        },
      ]);
      await page.waitForFunction(
        () => document.querySelector("#main-content")?.getAttribute("data-layout") === "level",
      );
      await page.getByRole("tab", { name: "Protocols", exact: true }).click();
      await page.getByRole("searchbox", { name: "Search AI tools" }).fill("flow_set");
      assert.match(await page.locator("#console-tool-catalog").innerText(), /Unavailable/);
      await page.getByRole("searchbox", { name: "Search AI tools" }).fill("node_set");
      await page.locator("#console-tool-catalog > details").first().locator("summary").click();
      assert.match(await page.locator("#console-tool-catalog").innerText(), /additionalProperties/);
      await page.screenshot({ path: output + "/protocols.png" });
      await page.getByRole("tab", { name: "Console", exact: true }).click();
      await page.locator("#graph-console-input").fill("Draft line one");
      await page.locator("#graph-console-input").press("Shift+Enter");
      await page.locator("#graph-console-input").press("a");
      assert.match(await page.locator("#graph-console-input").inputValue(), /\n/);
      await page.setViewportSize({ width: 390, height: 700 });
      await page.screenshot({ path: output + "/mobile.png" });
      results.push(
        "AI-only input, native calls, atomic mixed edits, undo/redo, layout, live Protocols and multiline draft",
      );
      await context.close();
    }
    {
      const { context, page } = await open();
      await ask(page, "Try a batch with a missing node", [
        {
          calls: [
            tool("edit_batch", {
              operations: [
                { tool: "node_set", arguments: { id: "A", field: "title", value: "Wrong" } },
                { tool: "node_delete", arguments: { id: "missing" } },
              ],
            }),
            tool("node_delete", { id: "B" }, "later"),
          ],
        },
        (body) => {
          const r = toolResults(body);
          assert.equal(r[0].ok, false);
          assert.equal(r[1].error.code, "DEPENDENCY_FAILED");
          return { calls: [tool("node_inspect", { id: "A", field: "title" }, "verify")] };
        },
        (body) => {
          assert.equal(toolResults(body).at(-1).data.queries[0].data.fields.title, "Alpha");
          return { text: "Batch rejected without edits." };
        },
      ]);
      await ask(page, "Analysis only: inspect this graph", [
        (body) => {
          assert.ok(!body.tools.some((t) => t.function.name === "node_delete"));
          return { calls: [tool("node_delete", { id: "A" })] };
        },
        (body) => {
          assert.equal(toolResults(body)[0].ok, false);
          return { text: "Read-only restriction enforced." };
        },
      ]);
      await inspectTitle(page, "Alpha");
      results.push("Batch rollback, dependent-call skip and read-only enforcement");
      await context.close();
    }
    {
      const { context, page } = await open();
      let release, started;
      const ready = new Promise((resolve) => (started = resolve));
      const gate = new Promise((resolve) => (release = resolve));
      const pending = ask(page, "Delete A", [
        async () => {
          started();
          await gate;
          return { calls: [tool("node_delete", { id: "A" })] };
        },
      ]);
      await ready;
      await page.getByRole("tab", { name: "Workbench", exact: true }).click();
      await page.getByRole("radio", { name: "service", exact: true }).check();
      release();
      await pending;
      await page.getByRole("tab", { name: "Console", exact: true }).click();
      assert.match(await page.locator(".console-terminal__output").innerText(), /changed/);
      await inspectTitle(page, "Alpha");
      results.push("Stale scope responses cannot edit");
      await context.close();
    }
    {
      const { context, page } = await open(
        graph({ hierarchy_edges: [{ id: "ga", source: "A", target: "B" }] }),
        "compound",
      );
      const button = page.locator('.dag-group-controls [role="button"]').first();
      await button.waitFor();
      assert.equal(await button.locator("rect").getAttribute("width"), "24");
      assert.match(await button.locator("text").textContent(), /[+−↗]/);
      await ask(page, "Create and inspect a nested group", [
        { calls: [tool("group_create", { id: "G", title: "Group", members: ["A"] })] },
        (body) => {
          assert.equal(toolResults(body)[0].ok, true);
          return { calls: [tool("group_inspect", { id: "G" }, "inspect")] };
        },
        (body) => {
          assert.match(JSON.stringify(toolResults(body).at(-1)), /"children":\["A"\]/);
          return { text: "Nested group created." };
        },
      ]);
      await page.getByRole("button", { name: "Close console", exact: true }).click();
      await page.screenshot({ path: output + "/nested-controls.png" });
      results.push("Nested containment tools and restored node button UI");
      await context.close();
    }
    {
      const { context, page } = await open(
        graph({
          metadata: { timeline: { clock: { mode: "calendar" } } },
          nodes: { A: { time: { at: "2026-10-27" } }, B: { time: { at: "2026-10-28" } } },
        }),
        "timeline",
      );
      await ask(page, "Move A forward two days and assign Delivery", [
        {
          calls: [
            tool("edit_batch", {
              operations: [
                { tool: "timeline_shift", arguments: { ids: ["A"], amount: 2, unit: "day" } },
                { tool: "timeline_track", arguments: { ids: ["A"], track: "Delivery" } },
              ],
            }),
          ],
        },
        () => ({ calls: [tool("timeline_inspect", { id: "A" }, "inspect")] }),
        (body) => {
          const s = JSON.stringify(toolResults(body).at(-1));
          assert.match(s, /2026-10-29/);
          assert.match(s, /Delivery/);
          return { text: "Timeline updated." };
        },
      ]);
      results.push("Timeline native edits and structured event feedback");
      await context.close();
    }
    {
      const { context, page } = await open(graph({ diagram: "sankey" }), "sankey");
      await ask(page, "Scale flow ab by two", [
        { calls: [tool("flow_scale", { edges: ["ab"], factor: 2 })] },
        () => ({ calls: [tool("edge_data_inspect", { id: "ab" }, "inspect")] }),
        (body) => {
          assert.match(JSON.stringify(toolResults(body).at(-1)), /"value":20/);
          return { text: "Flow scaled." };
        },
      ]);
      results.push("Sankey flow IDs and weights");
      await context.close();
    }
    {
      const { context, page } = await open(
        graph({
          metadata: { space: { dimensions: 3, coordinateSystem: "cartesian" } },
          nodes: { A: { space: [1, 2, 3] }, B: { space: [4, 5, 6] } },
        }),
        "spatial",
      );
      await ask(page, "Translate A and rotate the view", [
        {
          calls: [
            tool("space_translate", { ids: ["A"], delta: [1, 0, -1] }),
            tool("view_set", { patch: { yaw: 30 } }, "camera"),
          ],
        },
        () => ({ calls: [tool("space_inspect", { id: "A" }, "inspect")] }),
        (body) => {
          assert.match(JSON.stringify(toolResults(body).at(-1)), /\[2,2,2\]/);
          return { text: "Spatial data and camera updated separately." };
        },
      ]);
      results.push("Spatial coordinates and independent camera tools");
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log("PASS:", results.length, "scenarios\n" + results.join("\n"));
  } catch (error) {
    if (lastPage && !lastPage.isClosed()) {
      console.error(await lastPage.locator(".console-terminal__output").innerText());
      await lastPage.screenshot({ path: output + "/failure.png" });
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
