import { downloadTextFile } from "../adapters/download";

const EXPORT_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "stroke-linecap",
  "stroke-linejoin",
  "stroke-dasharray",
  "opacity",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "filter",
  "display",
  "visibility",
];

const EXPORT_OPTIONAL_NONE_PROPERTIES = new Set(["stroke", "stroke-dasharray", "filter"]);

export function buildExportSvg(sourceSvg: SVGSVGElement): SVGSVGElement {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("version", "1.1");
  clone.setAttribute("data-export", "true");
  clone.removeAttribute("style");
  clone.removeAttribute("data-zoom-scale");
  clone.removeAttribute("data-margin-left");
  clone.removeAttribute("data-margin-top");

  copyInlineSvgStyles(sourceSvg, clone);
  copyDagCssVars(sourceSvg, clone);
  normalizeExportMarkerColor(sourceSvg, clone);
  return clone;
}

function copyDagCssVars(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
  const sourceInlineStyle = sourceSvg.getAttribute("style") || "";
  sourceInlineStyle
    .split(";")
    .map((declaration) => declaration.trim())
    .filter((declaration) => declaration.startsWith("--dag-"))
    .forEach((declaration) => {
      const separatorIndex = declaration.indexOf(":");
      if (separatorIndex <= 0) {
        return;
      }
      cloneSvg.style.setProperty(
        declaration.slice(0, separatorIndex).trim(),
        declaration.slice(separatorIndex + 1).trim(),
      );
    });
}

function copyInlineSvgStyles(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
  const sourceElements = [sourceSvg, ...Array.from(sourceSvg.querySelectorAll("*"))];
  const cloneElements = [cloneSvg, ...Array.from(cloneSvg.querySelectorAll("*"))];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index] as SVGElement | undefined;
    if (!cloneElement) {
      return;
    }

    const computedStyle = window.getComputedStyle(sourceElement);
    const inlineStyle = EXPORT_STYLE_PROPERTIES.map((propertyName) => {
      if (
        propertyName === "display" &&
        (sourceElement.classList.contains("timeline-export-static") ||
          sourceElement.classList.contains("timeline-floating"))
      )
        return "";
      const propertyValue = computedStyle.getPropertyValue(propertyName);
      if (!propertyValue) {
        return "";
      }
      const trimmedValue = propertyValue.trim();
      if (!trimmedValue || trimmedValue === "normal") {
        return "";
      }
      if (trimmedValue === "none" && EXPORT_OPTIONAL_NONE_PROPERTIES.has(propertyName)) {
        return "";
      }
      if (propertyName === "filter" && /^url\(/i.test(trimmedValue)) {
        return "";
      }
      return `${propertyName}: ${trimmedValue};`;
    })
      .filter(Boolean)
      .join(" ");

    if (inlineStyle) {
      cloneElement.setAttribute("style", inlineStyle);
    } else {
      cloneElement.removeAttribute("style");
    }
  });
}

function normalizeExportMarkerColor(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
  const firstEdge = sourceSvg.querySelector(".dag-edge__path");
  const edgeStroke = firstEdge ? window.getComputedStyle(firstEdge).stroke.trim() : "";
  if (!edgeStroke) {
    return;
  }

  cloneSvg.querySelectorAll("marker path").forEach((path) => {
    for (const property of ["fill", "stroke"]) {
      if (path.getAttribute(property) === "context-stroke") {
        path.setAttribute(property, edgeStroke);
        (path as SVGElement).style.setProperty(property, edgeStroke);
      }
    }
  });
}

export function downloadSvg(sourceSvg: SVGSVGElement, fileName = "dag-graph.svg"): void {
  const exportSvg = buildExportSvg(sourceSvg);
  const svgData = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exportSvg)}`;
  downloadTextFile(svgData, fileName, "image/svg+xml;charset=utf-8");
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
