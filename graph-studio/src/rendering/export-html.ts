import { timelineClockCaption } from "../graph/timelineClock";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { downloadTextFile } from "../adapters/download";
import type { NormalizedDag } from "../graph/types";
import type { StageData } from "../layout/shared/types";
import { startHtmlViewer } from "./html-viewer";
import { HTML_VIEWER_CSS } from "./html-viewer-style";

export interface HtmlNodeDetails {
  key: string;
  title: string;
  fields: { name: string; text: string; html?: string }[];
  raw: string;
}
export interface HtmlGraphPayload {
  title: string;
  nodes: HtmlNodeDetails[];
  edges: { source: string; target: string; label: string; value?: unknown }[];
}

// Escape the HTML parser boundary, including strings inside application/json scripts.
export function serializeHtmlData(value: unknown): string {
  return JSON.stringify(value).replace(
    /[<>&\u2028\u2029]/g,
    (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`,
  );
}

function renderField(text: string): string {
  return renderToStaticMarkup(
    createElement(ReactMarkdown, {
      children: text,
      skipHtml: true,
      remarkPlugins: [remarkGfm, remarkMath],
      rehypePlugins: [[rehypeKatex, { output: "mathml", strict: false }]],
      components: {
        // Offline exports retain link text, but never depend on local files or remote images.
        img: ({ alt }) => createElement("span", {}, alt ? `[Image: ${alt}]` : "[Image]"),
        a: ({ href, children }) =>
          href && /^(https?:|mailto:)/i.test(href)
            ? createElement("a", { href, target: "_blank", rel: "noopener noreferrer" }, children)
            : createElement("span", {}, children),
      },
    }),
  );
}

export function buildHtmlPayload(stage: StageData, graph: NormalizedDag): HtmlGraphPayload {
  const visible = new Map<string, string>();
  for (const node of stage.nodes) visible.set(node.key, node.title);
  for (const group of stage.groups || []) visible.set(group.id, group.title);
  return {
    title: graph.title || "Graph Studio canvas",
    nodes: [...visible].map(([key, title]) => {
      const node = Object.prototype.hasOwnProperty.call(graph.nodes, key) ? graph.nodes[key] : undefined;
      const data = node
        ? Object.fromEntries(Object.entries(node).filter(([name]) => name !== "key"))
        : { title, kind: "group", description: "Group as displayed in the exported view." };
      return {
        key,
        title,
        fields: Object.entries(data).map(([name, value]) => ({
          name,
          text:
            name === "time" && stage.timeline?.clock?.mode === "relative"
              ? `${stage.nodeMap[key]?.timeline?.label ?? JSON.stringify(value)} · ${timelineClockCaption(stage.timeline.clock)}`
              : typeof value === "string"
                ? value
                : (JSON.stringify(value, null, 2) ?? ""),
          ...(typeof value === "string" && value.trim() ? { html: renderField(value) } : {}),
        })),
        raw: JSON.stringify({ id: key, data }, null, 2),
      };
    }),
    edges: stage.edges
      .filter((edge) => visible.has(edge.source) && visible.has(edge.target))
      .map((edge) => ({
        source: edge.source,
        target: edge.target,
        label: edge.label,
        value: edge.weight,
      })),
  };
}

// svgMarkup must come from prepareHtmlSvg; field HTML comes only from our Markdown renderer.
export function buildHtmlDocument(svgMarkup: string, payload: HtmlGraphPayload): string {
  const title = payload.title.replace(
    /[&<>"']/g,
    (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!,
  );
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">
<title>${title}</title><style>${HTML_VIEWER_CSS}</style></head><body>
<main id="canvas-surface">${svgMarkup}</main>
<div id="selection-actions" hidden><span id="selected-title"></span><button id="open-details" type="button">Node details ↗</button><button id="clear-selection" type="button" aria-label="Clear selection">×</button></div>
<div id="viewer-status" role="status" class="sr-only"></div>
<dialog id="node-details" aria-labelledby="detail-title">
<header><button id="close-details" type="button">← Back to canvas</button><h1 id="detail-title"></h1><span id="detail-key"></span></header>
<nav aria-label="Node detail views"><button data-view="fields" type="button" aria-pressed="true">Node fields</button><button data-view="raw" type="button" aria-pressed="false">Raw JSON</button><button data-view="edges" type="button" aria-pressed="false">Edges</button></nav>
<article id="detail-content" tabindex="0"></article></dialog>
<script id="graph-data" type="application/json">${serializeHtmlData(payload)}</script>
<script>(${startHtmlViewer.toString()})();</script></body></html>`;
}

export function downloadHtml(svgMarkup: string, stage: StageData, graph: NormalizedDag, fileName = "graph.json") {
  const payload = buildHtmlPayload(stage, graph);
  const html = buildHtmlDocument(svgMarkup, payload);
  downloadTextFile(html, `${fileName.replace(/\.[^.]+$/, "") || "graph"}.html`, "text/html;charset=utf-8");
}
