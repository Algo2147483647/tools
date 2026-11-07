import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, access } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { serve } from "../serve.mjs";
import { parseOptions } from "../launch.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
test("launcher modes remain exclusive", () => {
  assert.deepEqual(parseOptions([]), { preview: true });
  assert.deepEqual(parseOptions(["--no-browser"]), { noBrowser: true, preview: true });
  assert.deepEqual(parseOptions(["--build-only"]), { buildOnly: true });
  assert.deepEqual(parseOptions(["--dev", "--no-browser"]), { dev: true, noBrowser: true });
  assert.throws(() => parseOptions(["--dev", "--preview"]), /Choose only one/);
});
for (const preview of [false, true])
  test(`${preview ? "production" : "development"} serves frontend and backend together and closes both`, async () => {
    const state = await mkdtemp(join(tmpdir(), "graph-studio-launch-"));
    const previous = process.env.GRAPH_STUDIO_STATE_DIR;
    process.env.GRAPH_STUDIO_STATE_DIR = state;
    let runtime;
    try {
      runtime = await serve(root, { ...(preview ? {} : { dev: true }), noBrowser: true });
      const page = await fetch(runtime.url);
      assert.equal(page.status, 200);
      const html = await page.text();
      assert.match(html, /<div id="root">/);
      assert.equal(html.includes("/@vite/client"), !preview);
      const session = await fetch(runtime.url + "/api/v1/session");
      assert.equal(session.status, 200);
      assert.ok((await session.json()).token);
      await runtime.close();
      await assert.rejects(fetch(runtime.url));
      await assert.rejects(access(join(state, "service.lock")));
    } finally {
      await runtime?.close();
      if (previous === undefined) delete process.env.GRAPH_STUDIO_STATE_DIR;
      else process.env.GRAPH_STUDIO_STATE_DIR = previous;
      await rm(state, { recursive: true, force: true });
    }
  });
