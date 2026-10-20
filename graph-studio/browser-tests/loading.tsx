import { createElement } from "react";
import { createRoot } from "react-dom/client";
import FilePreviewModal from "../src/components/FilePreviewModal";
import MarkdownValue from "../src/components/MarkdownValue";
import { prepareHtmlSvg } from "../src/rendering/export-svg";
import "../src/styles/index.css";
import "katex/dist/katex.min.css";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function waitFor(predicate: () => boolean) {
  const deadline = performance.now() + 10000;
  while (!predicate()) {
    if (performance.now() > deadline) throw new Error("Timed out waiting for the preview.");
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

const tests: Array<[string, (host: HTMLDivElement) => Promise<void>]> = [
  [
    "Markdown and math load on demand",
    async (host) => {
      const root = createRoot(host);
      try {
        root.render(createElement(MarkdownValue, { value: "# Heading\n\n**Bold** and $x^2$" }));
        await waitFor(() => Boolean(host.querySelector(".katex")));
        assert(host.querySelector("h1")?.textContent === "Heading", "Markdown heading was lost.");
        assert(host.querySelector("strong")?.textContent === "Bold", "Markdown emphasis was lost.");
      } finally {
        root.unmount();
      }
    },
  ],
  [
    "Empty files finish loading",
    async (host) => {
      const root = createRoot(host);
      const file = new File([""], "empty.txt", { type: "text/plain" });
      const url = URL.createObjectURL(file);
      try {
        root.render(
          createElement(FilePreviewModal, {
            preview: {
              file,
              url,
              path: "empty.txt",
              relativePath: "empty.txt",
              originalUrl: "empty.txt",
              previewKind: "text",
            },
            relativeLinkRoot: null,
            onOpenRelativeLink: () => {},
            onClose: () => {},
          }),
        );
        await waitFor(() => Boolean(host.querySelector(".file-preview-text")));
        assert(host.querySelector(".file-preview-text")?.textContent === "", "Empty content changed.");
        assert(!host.textContent?.includes("Reading file:"), "Empty files must leave the loading state.");
      } finally {
        root.unmount();
        URL.revokeObjectURL(url);
      }
    },
  ],
  [
    "Export snapshots preserve inherited fonts and remain independent of later changes",
    async (host) => {
      host.style.fontFamily = "monospace";
      host.innerHTML =
        '<svg xmlns="http://www.w3.org/2000/svg"><text>Original title</text><script>bad()</script></svg>';
      const svg = host.querySelector("svg")!;
      const expectedFont = getComputedStyle(svg).fontFamily;
      const snapshot = prepareHtmlSvg(svg);
      svg.querySelector("text")!.textContent = "Changed title";
      const saved = new DOMParser().parseFromString(snapshot, "image/svg+xml");
      assert(saved.querySelector("text")?.textContent === "Original title", "Snapshot changed after capture.");
      assert(!saved.querySelector("script"), "Active SVG content survived export.");
      assert(saved.documentElement.style.fontFamily === expectedFont, "Inherited font was lost.");
      const { buildHtmlDocument } = await import("../src/rendering/export-html");
      const html = buildHtmlDocument(snapshot, { title: "Snapshot", nodes: [], edges: [] });
      assert(html.includes("Original title") && !html.includes("Changed title"), "Export used a later SVG.");
    },
  ],
];

document.getElementById("run-checks")!.addEventListener("click", async () => {
  const button = document.getElementById("run-checks") as HTMLButtonElement;
  const results = document.getElementById("results")!;
  const summary = document.getElementById("summary")!;
  button.disabled = true;
  results.replaceChildren();
  summary.dataset.state = "running";
  let failed = 0;
  for (const [name, test] of tests) {
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:-10000px;width:800px";
    document.body.append(host);
    const row = document.createElement("li");
    try {
      await test(host);
      row.textContent = `PASS ${name}`;
    } catch (error) {
      failed++;
      row.textContent = `FAIL ${name}: ${error instanceof Error ? error.message : String(error)}`;
    } finally {
      host.remove();
    }
    results.append(row);
  }
  summary.textContent = `${tests.length - failed} passed, ${failed} failed`;
  summary.dataset.state = failed ? "failed" : "passed";
  button.disabled = false;
});
