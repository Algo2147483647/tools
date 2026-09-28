import { downloadTextFile } from "../adapters/download";

const EXPORT_STYLE_PROPERTIES = [
  "fill",
  "stroke",
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
];

const EXPORT_OPTIONAL_NONE_PROPERTIES = new Set(["stroke", "stroke-dasharray", "filter"]);

export function buildExportSvg(sourceSvg: SVGSVGElement): SVGSVGElement {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("version", "1.1");
  clone.removeAttribute("style");
  clone.removeAttribute("data-zoom-scale");
  clone.removeAttribute("data-margin-left");
  clone.removeAttribute("data-margin-top");

  copyInlineSvgStyles(sourceSvg, clone);
  copyDagCssVars(sourceSvg, clone);
  normalizeExportMarkerColor(sourceSvg, clone);
  return clone;
}

export function copyDagCssVars(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
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

export function copyInlineSvgStyles(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
  const sourceElements = [sourceSvg, ...Array.from(sourceSvg.querySelectorAll("*"))];
  const cloneElements = [cloneSvg, ...Array.from(cloneSvg.querySelectorAll("*"))];

  sourceElements.forEach((sourceElement, index) => {
    const cloneElement = cloneElements[index] as SVGElement | undefined;
    if (!cloneElement) {
      return;
    }

    const computedStyle = window.getComputedStyle(sourceElement);
    const inlineStyle = EXPORT_STYLE_PROPERTIES
      .map((propertyName) => {
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

export function normalizeExportMarkerColor(sourceSvg: SVGSVGElement, cloneSvg: SVGSVGElement): void {
  const firstEdge = sourceSvg.querySelector(".dag-edge__path");
  const edgeStroke = firstEdge ? window.getComputedStyle(firstEdge).stroke.trim() : "";
  if (!edgeStroke) {
    return;
  }

  cloneSvg.querySelectorAll("marker path").forEach((path) => {
    if (path.getAttribute("fill") === "context-stroke") {
      path.setAttribute("fill", edgeStroke);
      (path as SVGElement).style.setProperty("fill", edgeStroke);
    }
  });
}

export function downloadSvg(sourceSvg: SVGSVGElement, fileName = "dag-graph.svg"): void {
  const exportSvg = buildExportSvg(sourceSvg);
  const svgData = `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(exportSvg)}`;
  downloadTextFile(svgData, fileName, "image/svg+xml;charset=utf-8");
}
