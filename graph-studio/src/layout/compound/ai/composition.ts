import type { CompoundBox } from "../../../graph/compound/geometry";

export interface ScopeComposition {
  groupId: string | null;
  direction: "RIGHT" | "DOWN";
  rows?: (string | null)[][];
  primaryPath?: string[];
  parallelBranches?: { from: string; members: string[] }[];
  placement?: { subject: string; relation: "left" | "right" | "above" | "below"; anchor: string }[];
  alignment?: { members: string[]; axis: "left" | "top" }[];
  spacing?: [number, number];
  reason: string;
}

export function compositionRows(plan: ScopeComposition, children: string[], support: Set<string>) {
  if (plan.rows) return plan.rows;
  const path = plan.primaryPath ?? [];
  const rows: (string | null)[][] = [];
  const used = new Set<string>();
  const put = (id: string, step: number, lane: number) => {
    const [x, y] = plan.direction === "RIGHT" ? [step, lane] : [lane, step];
    rows[y] ??= [];
    while (rows[y].length <= x) rows[y].push(null);
    if (used.has(id)) return;
    if (rows[y][x] !== null) return put(id, step, lane + 1);
    rows[y][x] = id;
    used.add(id);
  };
  path.forEach((id, step) => put(id, step, 0));
  for (const branch of plan.parallelBranches ?? []) {
    const step = Math.max(0, path.indexOf(branch.from));
    put(branch.from, step, 0);
    branch.members.forEach((id, lane) => put(id, step + 1, lane));
  }
  let step = 0;
  const hasMain = used.size > 0;
  for (const id of children.filter((id) => !support.has(id))) if (!used.has(id)) put(id, step++, hasMain ? 2 : 0);
  step = 0;
  for (const id of children.filter((id) => support.has(id))) if (!used.has(id)) put(id, step++, hasMain ? 3 : 1);
  return Array.from({ length: rows.length }, (_, i) => (rows[i]?.length ? rows[i] : [null]));
}

/** Execute relative intent with finite relaxation; never invent graph edges. */
export function applyComposition(
  plan: ScopeComposition,
  boxes: Map<string, CompoundBox>,
  children: string[],
  gap: [number, number],
) {
  const links: { before: string; after: string; axis: "x" | "y"; reason: string }[] = [];
  const aligns: { members: string[]; axis: "x" | "y" }[] = (plan.alignment ?? []).map((a) => ({
    members: a.members,
    axis: a.axis === "left" ? "x" : "y",
  }));
  const axis = plan.direction === "RIGHT" ? "x" : "y",
    cross = axis === "x" ? "y" : "x";
  const path = plan.primaryPath ?? [];
  for (let i = 1; i < path.length; i++)
    links.push({ before: path[i - 1], after: path[i], axis, reason: "primary path" });
  for (const branch of plan.parallelBranches ?? []) {
    for (const member of branch.members)
      links.push({ before: branch.from, after: member, axis, reason: "parallel branch" });
    aligns.push({ members: branch.members, axis });
    for (let i = 1; i < branch.members.length; i++)
      links.push({
        before: branch.members[i - 1],
        after: branch.members[i],
        axis: cross,
        reason: "separate branch lanes",
      });
  }
  for (const p of plan.placement ?? [])
    links.push({
      before: ["left", "above"].includes(p.relation) ? p.subject : p.anchor,
      after: ["left", "above"].includes(p.relation) ? p.anchor : p.subject,
      axis: ["left", "right"].includes(p.relation) ? "x" : "y",
      reason: `${p.subject} ${p.relation} ${p.anchor}`,
    });
  const size = (b: CompoundBox, axis: "x" | "y") => (axis === "x" ? b.width : b.height);
  const solve = () => {
    for (let pass = 0; pass <= children.length * 2 + 2; pass++) {
      let changed = false;
      for (const a of aligns) {
        const coordinate = Math.max(...a.members.map((id) => boxes.get(id)![a.axis]));
        for (const id of a.members)
          if (boxes.get(id)![a.axis] < coordinate) {
            boxes.get(id)![a.axis] = coordinate;
            changed = true;
          }
      }
      for (const link of links) {
        const before = boxes.get(link.before)!,
          after = boxes.get(link.after)!;
        const minimum = before[link.axis] + size(before, link.axis) + gap[link.axis === "x" ? 0 : 1];
        if (after[link.axis] < minimum) {
          after[link.axis] = minimum;
          changed = true;
        }
      }
      if (!changed) return;
    }
    throw new Error(
      `Conflicting composition in ${plan.groupId ?? "root"}: ${links.map((l) => l.reason + ` (${l.before}, ${l.after})`).join("; ")}. Change the ordering/alignment requirements.`,
    );
  };
  solve();
  // Relative placement can bring formerly separate cells together. Separate only actual overlaps.
  for (let pass = 0; pass < children.length * children.length; pass++) {
    let collision: [string, string] | undefined;
    for (let i = 0; i < children.length && !collision; i++)
      for (let j = i + 1; j < children.length; j++) {
        const a = boxes.get(children[i])!,
          b = boxes.get(children[j])!;
        if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) {
          collision = [children[i], children[j]];
          break;
        }
      }
    if (!collision) return;
    const [a, b] = collision;
    const alignedX = aligns.some((v) => v.axis === "x" && v.members.includes(a) && v.members.includes(b));
    const separation = alignedX ? "y" : "x";
    const first = boxes.get(a)![separation] <= boxes.get(b)![separation] ? a : b;
    links.push({ before: first, after: first === a ? b : a, axis: separation, reason: "non-overlap" });
    solve();
  }
  throw new Error("Composition cannot separate all siblings with the requested constraints.");
}
