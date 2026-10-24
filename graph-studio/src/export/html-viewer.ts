import type { HtmlGraphPayload } from "./html";

/** Serialized into the standalone export. Keep all runtime dependencies inside this function. */
export function startHtmlViewer() {
  const byId = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
  const data = JSON.parse(byId("graph-data").textContent || "{}") as HtmlGraphPayload;
  const nodes = new Map(data.nodes.map((node) => [node.key, node]));
  const svg = document.getElementById("export-canvas") as unknown as SVGSVGElement;
  const surface = byId("canvas-surface");
  const dialog = byId<HTMLDialogElement>("node-details");
  const content = byId("detail-content");
  const actions = byId("selection-actions");
  const initial = svg.viewBox.baseVal;
  const home = { x: initial.x, y: initial.y, width: initial.width || 1000, height: initial.height || 700 };
  let view = { ...home };
  let selected: string | null = null;
  let hovered: string | null = null;
  let detailKey: string | null = null;
  let detailView = "fields";
  let returnFocus: Element | null = null;
  const elements = Array.from(svg.querySelectorAll<SVGElement>("[data-key]"));
  const graphNodes = elements.filter((el) => el.classList.contains("dag-node"));
  const graphKeys = new Set(graphNodes.map((el) => el.dataset.key));
  const graphEdges = Array.from(svg.querySelectorAll<SVGElement>(".dag-edge[data-source][data-target]"));
  const tabs = Array.from(dialog.querySelectorAll<HTMLButtonElement>("[data-view]"));
  const edgesByKey = new Map<string, typeof data.edges>();
  for (const edge of data.edges) {
    for (const key of new Set([edge.source, edge.target])) {
      const edges = edgesByKey.get(key) || [];
      edges.push(edge);
      edgesByKey.set(key, edges);
    }
  }
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string) => {
    const el = document.createElement(tag);
    if (text !== undefined) el.textContent = text;
    return el;
  };
  const renderView = () => svg.setAttribute("viewBox", `${view.x} ${view.y} ${view.width} ${view.height}`);
  const nodeAt = (target: EventTarget | null) =>
    target instanceof Element ? target.closest<SVGElement>("[data-key]") : null;
  function syncInteraction() {
    const key = hovered || (graphKeys.has(selected ?? undefined) ? selected : null);
    const connected = new Set<string>();
    for (const edge of graphEdges) {
      const active = key !== null && (edge.dataset.source === key || edge.dataset.target === key);
      edge.dataset.active = String(active);
      if (active) {
        connected.add(edge.dataset.source!);
        connected.add(edge.dataset.target!);
      }
    }
    if (key !== null) connected.delete(key);
    svg.dataset.hasInteractiveNode = String(key !== null);
    for (const el of graphNodes) {
      el.dataset.hovered = String(el.dataset.key === key && key === hovered);
      el.dataset.focused = String(el.dataset.key === key && key === selected);
      el.dataset.connected = String(connected.has(el.dataset.key!));
    }
  }
  function select(key: string | null) {
    selected = key && nodes.has(key) ? key : null;
    for (const el of elements) {
      const active = el.dataset.key === selected;
      if (el.getAttribute("role") === "button") el.setAttribute("aria-pressed", String(active));
    }
    syncInteraction();
    actions.hidden = selected === null;
    byId("selected-title").textContent = selected ? nodes.get(selected)!.title : "";
    byId("viewer-status").textContent = selected
      ? `${nodes.get(selected)!.title} selected. Press Enter for details.`
      : "Selection cleared.";
  }
  function renderDetails() {
    const node = detailKey === null ? undefined : nodes.get(detailKey);
    if (!node) return;
    byId("detail-title").textContent = node.title;
    byId("detail-key").textContent = node.key;
    tabs.forEach((tab) => tab.setAttribute("aria-pressed", String(tab.dataset.view === detailView)));
    content.replaceChildren();
    content.scrollTop = 0;
    if (detailView === "raw") {
      content.append(make("pre", node.raw));
    } else if (detailView === "edges") {
      const edges = edgesByKey.get(node.key) || [];
      content.append(make("p", "Relationships included in this exported view."));
      if (!edges.length) content.append(make("p", "No relationships in this view."));
      for (const edge of edges) {
        const row = make("div");
        row.className = "detail-edge";
        const incoming = edge.target === node.key;
        const otherKey = incoming ? edge.source : edge.target;
        const button = make("button", nodes.get(otherKey)?.title || otherKey);
        button.type = "button";
        button.addEventListener("click", () => {
          select(otherKey);
          detailKey = otherKey;
          renderDetails();
          content.focus();
        });
        row.append(
          make("span", incoming ? "Incoming ←" : "Outgoing →"),
          button,
          make("code", edge.label || String(edge.value ?? "")),
        );
        content.append(row);
      }
    } else {
      for (const field of node.fields) {
        const row = make("section");
        row.className = "detail-field";
        const value = make("div");
        value.className = "detail-value";
        // Only pre-rendered, sanitized Markdown produced by the exporter is HTML.
        if (field.html) value.innerHTML = field.html;
        else value.append(make("pre", field.text));
        row.append(make("h2", field.name), value);
        content.append(row);
      }
      if (!node.fields.length) content.append(make("p", "No additional fields."));
    }
  }
  function openDetails(key: string | null) {
    if (key === null || !nodes.has(key)) return;
    select(key);
    detailKey = key;
    detailView = "fields";
    returnFocus = document.activeElement;
    renderDetails();
    if (!dialog.open) dialog.showModal();
    byId("close-details").focus();
  }
  byId("open-details").addEventListener("click", () => openDetails(selected));
  byId("clear-selection").addEventListener("click", () => {
    select(null);
    svg.focus();
  });
  byId("close-details").addEventListener("click", () => dialog.close());
  dialog.addEventListener("close", () => {
    if (returnFocus instanceof HTMLElement || returnFocus instanceof SVGElement) returnFocus.focus();
    else svg.focus();
  });
  tabs.forEach((tab) =>
    tab.addEventListener("click", () => {
      detailView = tab.dataset.view!;
      renderDetails();
    }),
  );

  let dragged = false;
  const pointers = new Map<number, { x: number; y: number }>();
  function svgPoint(x: number, y: number) {
    const matrix = svg.getScreenCTM();
    if (!matrix) return { x: view.x + view.width / 2, y: view.y + view.height / 2 };
    return new DOMPoint(x, y).matrixTransform(matrix.inverse());
  }
  function zoom(factor: number, x?: number, y?: number) {
    const nextWidth = Math.max(home.width / 80, Math.min(home.width * 4, view.width * factor));
    const scale = nextWidth / view.width;
    const anchor =
      x === undefined || y === undefined ? { x: view.x + view.width / 2, y: view.y + view.height / 2 } : svgPoint(x, y);
    view = {
      x: anchor.x - (anchor.x - view.x) * scale,
      y: anchor.y - (anchor.y - view.y) * scale,
      width: nextWidth,
      height: view.height * scale,
    };
    renderView();
  }
  surface.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      zoom(Math.exp(Math.max(-1, Math.min(1, event.deltaY * 0.002))), event.clientX, event.clientY);
    },
    { passive: false },
  );
  surface.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    if (!pointers.size) dragged = false;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    // Capture on the original target so a tap still activates the selected node.
    (event.target as Element).setPointerCapture(event.pointerId);
  });
  surface.addEventListener("pointermove", (event) => {
    const previous = pointers.get(event.pointerId);
    if (!previous) return;
    const next = { x: event.clientX, y: event.clientY };
    const other = [...pointers].find(([id]) => id !== event.pointerId)?.[1];
    if (other) {
      const before = Math.hypot(previous.x - other.x, previous.y - other.y);
      const after = Math.hypot(next.x - other.x, next.y - other.y);
      if (before > 0 && after > 0) zoom(before / after, (next.x + other.x) / 2, (next.y + other.y) / 2);
      dragged = true;
    } else {
      if (!dragged && Math.hypot(next.x - previous.x, next.y - previous.y) < 4) return;
      const from = svgPoint(previous.x, previous.y),
        to = svgPoint(next.x, next.y);
      view.x += from.x - to.x;
      view.y += from.y - to.y;
      renderView();
      dragged = true;
    }
    pointers.set(event.pointerId, next);
    surface.classList.add("is-panning");
  });
  const endPointer = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (!pointers.size) surface.classList.remove("is-panning");
  };
  surface.addEventListener("pointerup", endPointer);
  surface.addEventListener("pointercancel", endPointer);
  surface.addEventListener("lostpointercapture", endPointer);
  svg.addEventListener("pointerover", (event) => {
    const key = nodeAt(event.target)?.dataset.key;
    hovered = key && graphKeys.has(key) ? key : null;
    syncInteraction();
  });
  svg.addEventListener("pointerleave", () => {
    hovered = null;
    syncInteraction();
  });
  svg.addEventListener("focusin", (event) => {
    const key = nodeAt(event.target)?.dataset.key;
    if (key) select(key);
  });
  svg.addEventListener("click", (event) => {
    if (dragged) return;
    select(nodeAt(event.target)?.dataset.key ?? null);
  });
  svg.addEventListener("dblclick", (event) => {
    if (!dragged) openDetails(nodeAt(event.target)?.dataset.key ?? null);
  });
  svg.addEventListener("keydown", (event) => {
    const key = nodeAt(event.target)?.dataset.key;
    if (event.key === "Enter") {
      event.preventDefault();
      openDetails(key ?? selected);
    } else if (event.key === " " && key !== undefined) {
      event.preventDefault();
      select(key);
    } else if (event.key === "Escape") {
      select(null);
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoom(0.8);
    } else if (event.key === "-") {
      event.preventDefault();
      zoom(1.25);
    } else if (event.key === "0") {
      event.preventDefault();
      view = { ...home };
      renderView();
    } else if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      if (event.key === "ArrowLeft") view.x -= view.width * 0.1;
      if (event.key === "ArrowRight") view.x += view.width * 0.1;
      if (event.key === "ArrowUp") view.y -= view.height * 0.1;
      if (event.key === "ArrowDown") view.y += view.height * 0.1;
      renderView();
    }
  });
}
