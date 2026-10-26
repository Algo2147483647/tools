const assert = require("node:assert/strict");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const url = process.env.GRAPH_STUDIO_URL || "http://127.0.0.1:5178";
const graph = (extra = {}) => ({
  format: "graph-studio",
  version: 3,
  nodes: { A: { title: "Alpha" }, B: { title: "Beta" } },
  edges: [{ id: "ab", source: "A", target: "B", value: 10 }],
  ...extra,
});
(async () => {
  const browser = await chromium.launch({ channel: "chrome", headless: true });
  const results = [];
  const errors = [];
  async function open(doc) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() =>
      localStorage.setItem(
        "graph-studio:page-preferences",
        JSON.stringify({
          consoleSidebarOpen: true,
          aiSettings: {
            provider: "openai-compatible",
            baseUrl: "https://fixture.invalid/v1",
            apiKey: "",
            model: "fixture",
          },
        }),
      ),
    );
    const page = await context.newPage();
    page.on("pageerror", (e) => errors.push(e.message));
    await page.goto(url);
    await page
      .locator("input[type=file]")
      .first()
      .setInputFiles({ name: "fixture.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(doc)) });
    await page.locator("#graph-console-input").waitFor({ state: "visible" });
    return { context, page };
  }
  async function command(page, source) {
    const input = page.locator("#graph-console-input");
    if (source.includes("\n")) {
      await input.evaluate((el, text) => {
        const data = new DataTransfer();
        data.setData("text/plain", text);
        el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
      }, source);
    } else {
      await input.fill(source);
      await input.press("Enter");
    }
    await page.waitForFunction(() => document.querySelector("#graph-console-input")?.value === "");
  }
  async function output(page, text) {
    try {
      await page.waitForFunction(
        (text) => document.querySelector(".console-terminal__output")?.textContent.includes(text),
        text,
      );
    } catch (error) {
      console.error("Expected:", text, "Output:", await page.locator(".console-terminal__output").innerText());
      throw error;
    }
  }
  try {
    {
      const { context, page } = await open(graph());
      await page.locator("#main-content[data-layout]").waitFor();
      await command(
        page,
        '/set A title Changed\n/style set {"path":"style.appearance.display.showEdgeLabels","value":true}',
      );
      await output(page, "2 instructions executed, 1 mutation committed, 1 appearance update committed");
      await page.locator("#undo-btn").click();
      await command(page, "/clear");
      await command(page, "/ls A");
      await output(page, "Alpha");
      await command(page, '/style inspect {"path":"style.appearance.display.showEdgeLabels"}');
      await output(page, '"value": false');
      await page.locator("#redo-btn").click();
      await command(page, "/clear");
      await command(page, "/ls A");
      await output(page, "Changed");
      await command(page, '/layout run {"method":"dagre"}');
      await output(page, "completed");
      await page.waitForFunction(
        () => document.querySelector("#main-content")?.getAttribute("data-layout") === "dagre",
      );
      await page.getByRole("tab", { name: "Protocols", exact: true }).click();
      await page.getByRole("searchbox", { name: "Search command protocols" }).fill("space set");
      assert.match(await page.locator(".console-protocols").innerText(), /Unavailable/);
      await page.getByRole("tab", { name: "Console", exact: true }).click();
      await page.route("https://fixture.invalid/v1/models", (route) =>
        route.fulfill({ json: { data: [{ id: "fixture" }] } }),
      );
      await page.route("https://fixture.invalid/v1/chat/completions", (route) =>
        route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: "run_console",
                    answer: "Edit then arrange",
                    commandBatch: { commands: ["/set A title Workflow", '/layout run {"method":"level"}'] },
                  }),
                },
                finish_reason: "stop",
              },
            ],
          },
        }),
      );
      await command(page, "Rename A to Workflow and arrange using levels.");
      await output(page, "applied");
      await page.waitForFunction(
        () => document.querySelector("#main-content")?.getAttribute("data-layout") === "level",
      );
      await command(page, "/clear");
      await command(page, "/ls A");
      await output(page, "Workflow");
      results.push("Node-link mixed transaction undo/redo, dependent AI layout steps and mode-specific protocols");
      await page.unroute("https://fixture.invalid/v1/chat/completions");
      await page.route("https://fixture.invalid/v1/chat/completions", (route) =>
        route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: "run_console",
                    answer: "Remove",
                    commandBatch: { commands: ["/rm A"] },
                  }),
                },
                finish_reason: "stop",
              },
            ],
          },
        }),
      );
      await command(page, "Do not edit. Explain A.");
      await output(page, "analysis-only");
      await command(page, "/clear");
      await command(page, "/ls A");
      await output(page, "Workflow");
      results.push("Analysis-only request blocks a model mutation");
      await page.unroute("https://fixture.invalid/v1/chat/completions");
      let release;
      let requested = false;
      await page.route("https://fixture.invalid/v1/chat/completions", async (route) => {
        requested = true;
        await new Promise((resolve) => {
          release = resolve;
        });
        await route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: "run_console",
                    answer: "Remove",
                    commandBatch: { commands: ["/rm A"] },
                  }),
                },
                finish_reason: "stop",
              },
            ],
          },
        });
      });
      await command(page, "Delete A after checking the graph.");
      for (let i = 0; i < 100 && !requested; i++) await new Promise((resolve) => setTimeout(resolve, 20));
      assert.ok(requested);
      await page.locator('.dag-node[data-key="B"]').press("Enter");
      await page.waitForFunction(
        () => document.querySelector('.dag-node[data-key="B"]')?.getAttribute("data-selected") === "true",
      );
      release();
      await output(page, "discarded");
      await command(page, "/clear");
      await command(page, "/ls A");
      await output(page, "Workflow");
      results.push("In-flight AI result is discarded after console scope changes");
      await context.close();
    }
    {
      const { context, page } = await open(
        graph({
          metadata: { timeline: { clock: { mode: "calendar" } } },
          nodes: {
            A: { title: "Launch", time: { at: "2026-10-27" }, track: "T" },
            B: { title: "Build", time: { start: "2026-10-20", end: "2026-10-29" }, track: "T" },
          },
        }),
      );
      await command(page, '/timeline shift {"ids":["A"],"amount":3,"unit":"day"}');
      await command(page, '/timeline inspect {"id":"A"}');
      await output(page, "2026-10-30");
      let turn = 0;
      await page.route("https://fixture.invalid/v1/models", (route) =>
        route.fulfill({ json: { data: [{ id: "fixture" }] } }),
      );
      await page.route("https://fixture.invalid/v1/chat/completions", async (route) => {
        const body = route.request().postDataJSON();
        turn++;
        const response =
          turn === 1
            ? { kind: "inspect", answer: "Read event", commands: ['/timeline inspect {"id":"A"}'] }
            : {
                kind: "run_console",
                answer: "Move to Delivery",
                commandBatch: { commands: ['/timeline track {"ids":["A"],"track":"Delivery"}'] },
              };
        if (turn === 2) assert.match(JSON.stringify(body), /inspectionResults/);
        await route.fulfill({
          json: { choices: [{ message: { content: JSON.stringify(response) }, finish_reason: "stop" }] },
        });
      });
      await command(page, "Move launch to the Delivery track after checking its date.");
      await output(page, "applied");
      assert.equal(turn, 2);
      await command(page, "/clear");
      await command(page, '/timeline inspect {"id":"A"}');
      await output(page, "Delivery");
      results.push("Timeline editing and AI inspect -> result -> edit through mocked transport");
      await page.unroute("https://fixture.invalid/v1/chat/completions");
      await page.route("https://fixture.invalid/v1/chat/completions", (route) =>
        route.fulfill({
          json: {
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    kind: "run_console",
                    answer: "Shift then change view",
                    commandBatch: {
                      commands: [
                        '/timeline shift {"ids":["A"],"amount":1,"unit":"day"}',
                        '/view set {"patch":{"yaw":30}}',
                        '/timeline shift {"ids":["A"],"amount":2,"unit":"day"}',
                      ],
                    },
                  }),
                },
                finish_reason: "stop",
              },
            ],
          },
        }),
      );
      await command(page, "/clear");
      await command(page, "Shift launch one day, adjust the view, then shift another two days.");
      await output(page, "1 step(s) completed. Remaining steps were not applied.");
      await command(page, "/clear");
      await command(page, "apply");
      await output(page, "1 step(s) completed. Remaining steps were not applied.");
      await command(page, "/clear");
      await command(page, '/timeline inspect {"id":"A"}');
      await output(page, "2026-10-31");
      await page.locator("#undo-btn").click();
      await command(page, "/clear");
      await command(page, '/timeline inspect {"id":"A"}');
      await output(page, "2026-10-30");
      results.push("Failed dependent step retains only unfinished commands; retry does not repeat completed edits");
      await context.close();
    }
    {
      const { context, page } = await open(graph({ diagram: "sankey" }));
      await command(page, '/flow set {"edge":"ab","value":42}');
      await output(page, "edges.ab.value: 10 → 42");
      await command(page, "/flow inspect");
      await output(page, '"input": 42');
      results.push("Sankey numeric flow and diagnostic output");
      await context.close();
    }
    {
      const { context, page } = await open(graph({ hierarchy_edges: [{ id: "h", source: "A", target: "B" }] }));
      await command(page, '/group dissolve {"id":"A"}');
      await output(page, "hierarchy.h:");
      await command(page, "/edge-data inspect");
      await output(page, '"id": "ab"');
      results.push("Compound containment edit preserves ordinary edges");
      await context.close();
    }
    {
      const { context, page } = await open(
        graph({
          metadata: { space: { dimensions: 3, coordinateSystem: "cartesian" } },
          nodes: { A: { space: [1, 2, 3] }, B: { space: [4, 5, 6] } },
        }),
      );
      await command(page, '/view set {"patch":{"yaw":30}}');
      await output(page, "View updated");
      await command(page, '/space inspect {"id":"A"}');
      await output(page, '"coordinates": [');
      await command(page, '/space translate {"ids":["A"],"delta":[1,0,0]}');
      await output(page, "[1,2,3] → [2,2,3]");
      await command(page, "/view inspect");
      await output(page, '"yaw": 30');
      results.push("Spatial camera and coordinates remain independent");
      await context.close();
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ passed: results.length, results }, null, 2));
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
