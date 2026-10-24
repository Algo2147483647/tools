import type { LayoutIntent } from "../layout-plan";

export function constrainLayoutProposal(intent: LayoutIntent, boundary: LayoutIntent, panel = false) {
  if (
    intent.scope.groupId !== boundary.scope.groupId ||
    intent.scope.includeDescendants !== boundary.scope.includeDescendants
  )
    throw new Error("The proposal changes scope. Select that scope before requesting another layout.");
  if (boundary.operation === "route-only" && intent.operation !== "route-only")
    throw new Error("This request keeps nodes fixed. Choose Layout & routes to allow node movement.");
  if (boundary.boundaryPolicy === "strict" && intent.boundaryPolicy !== "strict")
    throw new Error("The proposal moves surrounding groups. Enable that option before requesting it.");
  if (intent.objective !== boundary.objective)
    throw new Error("A refinement must preserve the selected layout objective.");
  const protectedConstraints = boundary.constraints.filter(
    (c) => panel || c.type === "pin" || c.type === "unpin" || c.type === "direction",
  );
  if (
    protectedConstraints.some(
      (constraint) => !intent.constraints.some((c) => JSON.stringify(c) === JSON.stringify(constraint)),
    )
  )
    throw new Error(
      "The proposal removed a requested constraint. Existing locks and selected preferences must be preserved.",
    );
  for (const constraint of intent.constraints.filter((c) => c.type === "unpin")) {
    if (panel || !boundary.constraints.some((c) => c.type === "unpin" && c.nodeId === constraint.nodeId))
      throw new Error("A refinement cannot release additional position locks.");
  }
}
