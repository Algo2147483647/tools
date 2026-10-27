import type { Core, ElementDefinition, StylesheetJson } from "cytoscape";
import type { CompoundBox } from "../../../graph/compound/geometry";
import type { LayoutGeometry, LayoutProblem } from "../layout-plan";
import { groupContentTop } from "../../shared/group-title";

/** Reserve container envelopes during the force solve, never grow them afterwards. */
export function createFcoseModel(problem: LayoutProblem) {
  const { items, edges } = problem.projection;
  const ids = new Map(items.map((item, i) => [item.id, `n${i}`]));
  const children = new Map(items.map((item) => [item.id, items.filter((c) => c.parentId === item.id)]));
  const sizes = new Map<string, { width: number; height: number; padding: number }>();
  for (const item of [...items].reverse()) {
    const minimum = problem.minimumSizes[item.id];
    if (!minimum || ![minimum.width, minimum.height].every((n) => Number.isFinite(n) && n > 0))
      throw new Error(`fCoSE: missing measured size for ${item.id}.`);
    const nested = children.get(item.id)!;
    // fCoSE 2.2 only reads uniform padding, not Cytoscape min-width/min-height.
    // A conservative envelope guarantees both the header and measured minimums
    // participate in repulsion at every depth. Extraction may only shrink it.
    const padding = nested.length
      ? Math.ceil(
          Math.max(
            groupContentTop(item.title),
            24,
            (minimum.width - Math.max(...nested.map((c) => sizes.get(c.id)!.width))) / 2,
            (minimum.height - Math.max(...nested.map((c) => sizes.get(c.id)!.height))) / 2,
          ),
        ) + 2
      : 0;
    sizes.set(item.id, {
      width: nested.length ? Math.max(...nested.map((c) => sizes.get(c.id)!.width)) + 2 * padding : minimum.width,
      height: nested.length ? Math.max(...nested.map((c) => sizes.get(c.id)!.height)) + 2 * padding : minimum.height,
      padding,
    });
  }
  const fixedNodeConstraint: { nodeId: string; position: { x: number; y: number } }[] = [];
  let externalY = 36;
  const elements: ElementDefinition[] = items.map((item, index) => {
    const size = sizes.get(item.id)!;
    const saved = item.external ? problem.baseline.boxes[item.id] : undefined;
    const position = saved
      ? { x: saved.x + saved.width / 2, y: saved.y + saved.height / 2 }
      : { x: 36 + size.width / 2, y: item.external ? externalY + size.height / 2 : 36 + index * 100 };
    if (item.external) {
      fixedNodeConstraint.push({ nodeId: ids.get(item.id)!, position: { ...position } });
      externalY += size.height + Math.max(36, problem.rowGap);
    }
    return {
      data: { id: ids.get(item.id)!, ...(item.parentId ? { parent: ids.get(item.parentId) } : {}), ...size },
      position,
    };
  });
  const diagnostics: string[] = [];
  const parents = new Map(items.map((item) => [item.id, item.parentId]));
  const ancestor = (a: string, b: string) => {
    for (let p = parents.get(b); p != null; p = parents.get(p)) if (p === a) return true;
    return false;
  };
  for (const [i, edge] of edges.entries()) {
    if (!ids.has(edge.source) || !ids.has(edge.target)) throw new Error(`fCoSE: unknown endpoint on ${edge.id}.`);
    if (edge.source === edge.target) throw new Error(`fCoSE: routed self-loop is unsupported: ${edge.id}.`);
    if (ancestor(edge.source, edge.target) || ancestor(edge.target, edge.source)) {
      diagnostics.push(
        `fCoSE excludes ancestor/descendant edge ${edge.id} from spring forces; its visible endpoints and orthogonal route are retained.`,
      );
      continue;
    }
    elements.push({ data: { id: `e${i}`, source: ids.get(edge.source), target: ids.get(edge.target) } });
  }
  const style: StylesheetJson = [
    {
      selector: "node",
      style: {
        width: "data(width)",
        height: "data(height)",
        padding: "data(padding)",
        "border-width": 0,
        "overlay-opacity": 0,
        label: "",
        "compound-sizing-wrt-labels": "exclude",
      },
    },
  ];
  return { elements, style, ids, children, fixedNodeConstraint, diagnostics };
}

export function extractFcoseGeometry(
  cy: Core,
  problem: LayoutProblem,
  model: ReturnType<typeof createFcoseModel>,
): LayoutGeometry {
  const boxes: Record<string, CompoundBox> = Object.create(null);
  for (const item of [...problem.projection.items].reverse()) {
    const node = cy.getElementById(model.ids.get(item.id)!);
    const width = node.outerWidth(),
      height = node.outerHeight(),
      center = node.position();
    const reserved = { x: center.x - width / 2, y: center.y - height / 2, width, height };
    if (![...Object.values(reserved)].every(Number.isFinite))
      throw new Error(`fCoSE: invalid envelope for ${item.id}.`);
    const nested = model.children.get(item.id)!;
    if (!nested.length) {
      boxes[item.id] = reserved;
      continue;
    }
    const childBoxes = nested.map((c) => boxes[c.id]);
    const left = Math.min(...childBoxes.map((b) => b.x)) - 24;
    const top = Math.min(...childBoxes.map((b) => b.y)) - groupContentTop(item.title);
    const right = Math.max(...childBoxes.map((b) => b.x + b.width)) + 24;
    const bottom = Math.max(...childBoxes.map((b) => b.y + b.height)) + 24;
    const minimum = problem.minimumSizes[item.id];
    const w = Math.max(minimum.width, right - left),
      h = Math.max(minimum.height, bottom - top);
    const box = {
      x: Math.min(left, Math.max(reserved.x, right - w)),
      y: Math.min(top, Math.max(reserved.y, bottom - h)),
      width: w,
      height: h,
    };
    if (
      box.x < reserved.x - 0.01 ||
      box.y < reserved.y - 0.01 ||
      box.x + w > reserved.x + width + 0.01 ||
      box.y + h > reserved.y + height + 0.01
    )
      throw new Error(`fCoSE: measured container ${item.id} does not fit its reserved envelope.`);
    boxes[item.id] = box;
  }
  // Rebase the entire drawing, never an individual container or subtree.
  const hasFixedHistory = problem.projection.items.some((i) => i.external && problem.baseline.boxes[i.id]);
  const dx = hasFixedHistory ? 0 : 36 - Math.min(0, ...Object.values(boxes).map((b) => b.x));
  const dy = hasFixedHistory ? 0 : 36 - Math.min(0, ...Object.values(boxes).map((b) => b.y));
  for (const box of Object.values(boxes)) {
    box.x += dx;
    box.y += dy;
  }
  for (const item of problem.projection.items.filter((i) => i.external)) {
    const saved = problem.baseline.boxes[item.id],
      actual = boxes[item.id];
    if (saved && (Math.abs(saved.x - actual.x) > 0.01 || Math.abs(saved.y - actual.y) > 0.01))
      throw new Error(`fCoSE moved fixed external node ${item.id}.`);
  }
  return {
    boxes,
    routes: {},
    width: Math.max(problem.minimumCanvas?.width ?? 72, ...Object.values(boxes).map((b) => b.x + b.width + 36)),
    height: Math.max(problem.minimumCanvas?.height ?? 72, ...Object.values(boxes).map((b) => b.y + b.height + 36)),
  };
}
