/** Editable request; geometry is always calculated locally. */
export const DEFAULT_COMPOUND_LAYOUT_REQUEST = [
  "Improve the current scope using the selected objective and direction.",
  "Reduce edge crossings, shared runs, unnecessary bends and label collisions.",
  "Preserve graph content and containment. Arrange nodes, resize containers and route connections together.",
  "Explain unresolved trade-offs using measured results. The application applies the selected declaration directly.",
].join(" ");
export const COMPOUND_LAYOUT_PROMPT = [
  'When compoundLayout is available, use {"kind":"inspect_layout","answer":"...","scopeId":null} to inspect, or {"kind":"propose_layout","layoutProtocolVersion":1,"answer":"...","intent":{"scope":{"groupId":null,"includeDescendants":true},"operation":"layout-and-route","boundaryPolicy":"allow-ancestor-resize","objective":"readability","constraints":[]}} to arrange.',
  "Use compoundLayout.defaultIntent and preserve the requestPolicy scope, objective and selected constraints. Layout is declarative, stored separately from the graph. Never supply coordinates, snapshots, graph edits, CSS transforms or position locks.",
  'Constraints: {"type":"direction","scopeId":null,"value":"RIGHT","strength":"soft"}; {"type":"prefer-outer-route","edgeId":"original-id","strength":"soft"}; {"type":"port-side","edgeId":"original-id","end":"source","side":"east","strength":"soft"}. Directions: AUTO, RIGHT, DOWN. Objectives: readability, compact.',
  "Nodes, containers and connections are arranged together. Ordinary parents/children mean adjacency; use containmentParentId and containmentChildIds for nesting. Inspect a named scope when context is truncated; do not guess hidden IDs.",
  "Use routingHotspots and measured quality to diagnose crossings, shared runs, detours and labels. Use only advertised capabilities; explain unsupported routing constraints.",
  "When feedback is present, finish with answer or propose one refinement preserving scope, objective and selected constraints. Never claim an unmeasured improvement. The application validates and directly applies the best declaration; there is no user preview or review step.",
].join("\n");
