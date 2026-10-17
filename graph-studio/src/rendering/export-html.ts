import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import { downloadTextFile } from "../adapters/download";
import type { NormalizedDag } from "../graph/types";
import type { StageData } from "../layout/types";
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
          text: typeof value === "string" ? value : (JSON.stringify(value, null, 2) ?? ""),
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

export function prepareHtmlSvg(source: SVGSVGElement): string {
  // Keep the live CSS and per-node variables: computed inline snapshots freeze
  // hover/selection styles and override the viewer's subsequent state changes.
  const svg = source.cloneNode(true) as SVGSVGElement;
  svg.removeAttribute("style");
  // Preserve typography inherited from the workspace without freezing the
  // node/edge properties that change in response to interaction.
  const inherited = source.ownerDocument.defaultView?.getComputedStyle(source);
  for (const name of ["font-family", "font-size", "font-weight", "font-style", "letter-spacing", "color"]) {
    const value = inherited?.getPropertyValue(name);
    if (value) svg.style.setProperty(name, value);
  }
  for (const name of Array.from(source.style)) {
    if (name.startsWith("--dag-")) svg.style.setProperty(name, source.style.getPropertyValue(name));
  }
  svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  svg.setAttribute("data-export", "true");
  svg.removeAttribute("data-zoom-scale");
  svg.removeAttribute("width");
  svg.removeAttribute("height");
  svg.setAttribute("id", "export-canvas");
  svg.setAttribute("role", "group");
  svg.setAttribute(
    "aria-label",
    "Graph canvas. Drag to pan, scroll to zoom. Select a node and press Enter for details.",
  );
  svg.setAttribute("tabindex", "0");
  svg.setAttribute("data-has-interactive-node", "false");
  // Exported files contain only our viewer script and passive SVG drawing primitives.
  svg
    .querySelectorAll(
      "script, foreignObject, iframe, object, embed, a, image, animate, animateTransform, set, .dag-group-controls",
    )
    .forEach((el) => el.remove());
  for (const el of [svg, ...Array.from(svg.querySelectorAll("*"))]) {
    for (const attr of Array.from(el.attributes)) {
      if (/^on/i.test(attr.name) || (/^(href|xlink:href)$/i.test(attr.name) && !attr.value.startsWith("#")))
        el.removeAttribute(attr.name);
    }
    for (const name of ["data-focused", "data-hovered", "data-connected", "data-active"])
      if (el.hasAttribute(name)) el.setAttribute(name, "false");
  }
  svg.querySelectorAll<SVGGElement>(".dag-node, .dag-group-header").forEach((el) => {
    if (el.classList.contains("dag-group-header")) el.dataset.key = el.dataset.groupId;
    if (el.dataset.timelineLayer === "leader" || el.dataset.timelineLayer === "marker") return;
    el.setAttribute("role", "button");
    el.setAttribute("tabindex", "0");
    el.setAttribute("aria-pressed", "false");
    el.setAttribute(
      "aria-label",
      `${el.getAttribute("aria-label")?.split(". Activate")[0] || el.dataset.key}. Select; double-click or press Enter for details.`,
    );
  });
  return new XMLSerializer().serializeToString(svg);
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

export function downloadHtml(source: SVGSVGElement, stage: StageData, graph: NormalizedDag, fileName = "graph.json") {
  const payload = buildHtmlPayload(stage, graph);
  const html = buildHtmlDocument(prepareHtmlSvg(source), payload);
  downloadTextFile(html, `${fileName.replace(/\.[^.]+$/, "") || "graph"}.html`, "text/html;charset=utf-8");
}
