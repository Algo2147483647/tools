import { indexHierarchy, isHierarchyDescendant } from "./hierarchy";
import type { CompoundView, NormalizedDag } from "./types";

const has = (value: object, id: string) => Object.prototype.hasOwnProperty.call(value, id);

/** Open a card without restoring every previously expanded descendant at once. */
export function toggleCompoundGroup(dag: NormalizedDag, view: CompoundView, id: string): CompoundView {
  const groups = dag.hierarchy?.groups ?? {};
  if (!has(groups, id) || id === view.focusGroupId) return view;
  const collapsed = new Set(view.collapsedGroupIds);
  if (collapsed.has(id)) {
    const index = indexHierarchy(dag);
    for (const child of Object.keys(groups)) {
      if (child !== id && isHierarchyDescendant(index, child, id)) collapsed.add(child);
    }
    collapsed.delete(id);
  } else collapsed.add(id);
  return { ...view, collapsedGroupIds: [...collapsed] };
}

/** Advance each visible collapsed branch by exactly one level within the current scope. */
export function expandCompoundLevel(dag: NormalizedDag, view: CompoundView): CompoundView {
  const groups = dag.hierarchy?.groups ?? {};
  const index = indexHierarchy(dag);
  const focus = view.focusGroupId && has(groups, view.focusGroupId) ? view.focusGroupId : null;
  const collapsed = new Set(view.collapsedGroupIds);
  const frontier = new Set<string>();
  const hidden = new Set<string>();
  for (const id of index.order) {
    if (id === focus || (focus && !isHierarchyDescendant(index, id, focus))) continue;
    const parent = index.parent.get(id);
    if (parent && parent !== focus && (frontier.has(parent) || hidden.has(parent))) {
      hidden.add(id);
      if (has(groups, id)) collapsed.add(id);
    } else if (has(groups, id) && collapsed.has(id)) frontier.add(id);
  }
  frontier.forEach((id) => collapsed.delete(id));
  return { ...view, collapsedGroupIds: [...collapsed] };
}

/** Collapse this scope while preserving the display state of all other branches. */
export function collapseCompoundScope(dag: NormalizedDag, view: CompoundView): CompoundView {
  const groups = dag.hierarchy?.groups ?? {};
  const index = indexHierarchy(dag);
  const focus = view.focusGroupId && has(groups, view.focusGroupId) ? view.focusGroupId : null;
  const collapsed = new Set(view.collapsedGroupIds);
  for (const id of Object.keys(groups)) {
    if (id !== focus && (!focus || isHierarchyDescendant(index, id, focus))) collapsed.add(id);
  }
  return { ...view, collapsedGroupIds: [...collapsed] };
}

/** Make a hierarchy search result visible before selecting or locating it on the canvas. */
export function revealCompoundMember(dag: NormalizedDag, view: CompoundView, id: string): CompoundView {
  const groups = dag.hierarchy?.groups ?? {};
  if (!has(groups, id) && !has(dag.nodes, id)) return view;
  const index = indexHierarchy(dag);
  let focus = view.focusGroupId && has(groups, view.focusGroupId) ? view.focusGroupId : null;
  if (focus && (id === focus || !isHierarchyDescendant(index, id, focus))) focus = index.parent.get(id) ?? null;
  const collapsed = new Set(view.collapsedGroupIds);
  let parent = index.parent.get(id);
  while (parent && parent !== focus) {
    collapsed.delete(parent);
    parent = index.parent.get(parent);
  }
  return { ...view, focusGroupId: focus, collapsedGroupIds: [...collapsed] };
}
