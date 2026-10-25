/** Editable request; geometry is always calculated locally. */
export const DEFAULT_COMPOUND_LAYOUT_REQUEST = [
  "Organize the main flow and branches into a clear, compact reading order within the current scope.",
  "Choose directions per group and use a sibling flow order only where a sequential reading helps.",
  "Keep feedback connections short. Balance crossings and shared paths against detours and empty canvas.",
  "Preserve graph content and containment. The local solver measures cards, resizes groups and routes connections.",
  "Return the complete replacement plan for the supplied scope. Use routing preferences sparingly.",
].join(" ");

export const COMPOUND_PLANNER_INSTRUCTIONS = [
  "You plan a nested graph's structure; the local solver computes all geometry.",
  "First identify the main flow, branches, support groups and feedback connections from titles and relationships.",
  "preferences.direction controls the current scope. Preserve a non-AUTO selectedDirection.",
  "direction constraints set the orientation of a supplied expanded group; RIGHT is left-to-right, DOWN is top-to-bottom, AUTO lets the solver choose.",
  "flow-order lists ALL sibling IDs of an orderable scope exactly once, in increasing flow-axis order. It is a sequential arrangement, not a grid or graph edit. Do not impose a sequence on unrelated parallel branches; leave those to topology packing.",
  "port-side is a soft endpoint preference; use it only when the flow or observed relative positions justify it. Group movement may change the appropriate side.",
  "portMode is controlled by the application: midpoints restricts endpoints to the four side centers (shared attachments are allowed); distributed offers multiple side ports to reduce overlap. Do not change this setting.",
  "prefer-outer-route tries a nearby exterior corridor with a bounded detour. It never means routing around the entire canvas. Use it only for specific feedback or congested connections, not every crossing edge.",
  "All preferences are soft. Preserve short paths, usable aspect ratio and compact group arrangements while reducing crossings. Do not trade tiny shared-run improvements for long detours.",
  "Return a complete replacement of constraints for the supplied editable scopes and original edge IDs. Omitted constraints are removed there; unsupplied scopes remain unchanged. Empty constraints clears the supplied preferences.",
  "At most 32 constraints. Prefer a few structural decisions over many per-edge hints. Use only IDs in context. External nodes are fixed.",
  "When executionFeedback is present, inspect actual diagnostics and detours, then regenerate the complete plan once. Remove ineffective hints and revise structural decisions; do not repeat a plan that caused a solve failure.",
].join("\n");
