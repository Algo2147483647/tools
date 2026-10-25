import { createLayoutConfigFile } from "../schema/layoutConfig";
import { timelineFixture } from "./layoutPersistence.test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createServer } from "node:http";
import { saveExampleStyle, styleFilesMiddleware } from "../../scripts/style-files";
import { createStyleDocument } from "../schema/styleProtocol";
import { getDefaultChartStyle } from "../schema/appearance/styles";
import { defineSuite, defineTest } from "./harness";
const schema = resolve("src/schema/appearance/definition.json");
async function fixture(run: (root: string, input: any) => Promise<void>) {
  const parent = resolve("test-results");
  await mkdir(parent, { recursive: true });
  const root = await mkdtemp(resolve(parent, "style-service-"));
  try {
    await mkdir(resolve(root, "demo/graphs"), { recursive: true });
    await mkdir(resolve(root, "demo/styles"));
    await writeFile(
      resolve(root, "demo/graph-studio.workspace.json"),
      JSON.stringify({ graphs: ["graphs/main.json"] }),
    );
    await writeFile(
      resolve(root, "demo/graphs/main.json"),
      JSON.stringify({ format: "graph-studio", version: 3, nodes: {}, edges: [] }),
    );
    await run(root, {
      exampleId: "demo",
      graphPath: "graphs/main.json",
      document: createStyleDocument("compound", getDefaultChartStyle("compound")),
    });
  } finally {
    assert.ok(root.startsWith(parent + sep));
    await rm(root, { recursive: true, force: true });
  }
}
export const styleFilesSuite = defineSuite("Local style file service", [
  defineTest("Layout writes configuration only beside the graph and overwrites its existing association", async () => {
    await fixture(async (root, input) => {
      input.document = createLayoutConfigFile(timelineFixture().document, "timeline", timelineFixture().settings);
      const saved = await saveExampleStyle(root, schema, input, "layout");
      assert.equal(saved.reference, "main.timeline.layout.json");
      const graph = JSON.parse(await readFile(resolve(root, "demo/graphs/main.json"), "utf8"));
      assert.equal(graph.metadata.layout, saved.reference);
      assert.deepEqual(saved.graph, graph);
      input.document.settings.view.orientation = "horizontal";
      assert.ok(!JSON.stringify(input.document).includes("geometry"));
      await assert.rejects(
        saveExampleStyle(root, schema, { ...input, document: { ...input.document, geometry: {} } }, "layout"),
      );
      const updated = await saveExampleStyle(root, schema, { ...input, reference: saved.reference }, "layout");
      assert.equal(saved.path, updated.path);
      assert.deepEqual(JSON.parse(await readFile(resolve(root, "demo", saved.path), "utf8")), input.document);
      assert.deepEqual((await readdir(resolve(root, "demo/graphs"))).sort(), [
        "main.json",
        "main.timeline.layout.json",
      ]);
      await assert.rejects(saveExampleStyle(root, schema, { ...input, reference: "main.json" }, "layout"));
      await assert.rejects(saveExampleStyle(root, schema, { ...input, reference: "../../outside.json" }, "layout"));
    });
  }),
  defineTest("creates a full Schema JSON next to its source graph and updates the same file", async () => {
    await fixture(async (root, input) => {
      const saved = await saveExampleStyle(root, schema, input);
      assert.equal(saved.path, "graphs/main.compound.style.json");
      assert.equal(saved.reference, "main.compound.style.json");
      assert.deepEqual(JSON.parse(await readFile(resolve(root, "demo", saved.path), "utf8")), input.document);
      input.document.style.appearance.css = ".dag-node { opacity: .4; }";
      const updated = await saveExampleStyle(root, schema, { ...input, reference: saved.reference });
      assert.equal(updated.path, saved.path);
      assert.deepEqual((await readdir(resolve(root, "demo/graphs"))).sort(), ["main.compound.style.json", "main.json"]);
      assert.deepEqual(JSON.parse(await readFile(resolve(root, "demo", saved.path), "utf8")), input.document);
      const relative = await saveExampleStyle(root, schema, { ...input, reference: "../styles/shared.json" });
      assert.equal(relative.path, "styles/shared.json");
      assert.equal(relative.reference, "../styles/shared.json");
    });
  }),
  defineTest("rejects escaping paths, unrelated files and invalid Schema values before writing", async () => {
    await fixture(async (root, input) => {
      for (const reference of [
        "../../outside.json",
        "main.json",
        "../graph-studio.workspace.json",
        "https://example.com/style.json",
      ])
        await assert.rejects(saveExampleStyle(root, schema, { ...input, reference }));
      await assert.rejects(saveExampleStyle(root, schema, { ...input, exampleId: "../demo" }));
      await assert.rejects(saveExampleStyle(root, schema, { ...input, graphPath: "other.json" }));
      input.document.style.appearance.nodes.width = "invalid";
      await assert.rejects(saveExampleStyle(root, schema, input));
      assert.deepEqual(await readdir(resolve(root, "demo/graphs")), ["main.json"]);
    });
  }),
  defineTest("only local same-origin JSON requests can write style files", async () => {
    await fixture(async (root, input) => {
      const middleware = styleFilesMiddleware(root, schema);
      const server = createServer((req, res) => {
        void middleware(req, res, () => {
          res.statusCode = 404;
          res.end();
        });
      });
      await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
      try {
        const address = server.address() as { port: number };
        const origin = `http://127.0.0.1:${address.port}`;
        const options = {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Graph-Studio": "style-update", Origin: origin },
          body: JSON.stringify(input),
        };
        const denied = await fetch(origin + "/__graph-studio/style", {
          ...options,
          headers: { ...options.headers, Origin: "https://foreign.invalid" },
        });
        assert.equal(denied.status, 403);
        const saved = await fetch(origin + "/__graph-studio/style", options);
        assert.equal(saved.status, 200, await saved.clone().text());
        assert.equal(((await saved.json()) as any).reference, "main.compound.style.json");
      } finally {
        await new Promise<void>((done, reject) => server.close((error) => (error ? reject(error) : done())));
      }
    });
  }),
]);
