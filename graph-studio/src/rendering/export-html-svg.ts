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
