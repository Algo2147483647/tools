import type { LayoutIntent } from "../layout-plan";

export function constrainLayoutProposal(intent: LayoutIntent, boundary: LayoutIntent, panel = false) {
  if (
    intent.scope.groupId !== boundary.scope.groupId ||
    intent.scope.includeDescendants !== boundary.scope.includeDescendants
  )
    throw new Error("The proposal changes scope. Select that scope before requesting another layout.");
  if (intent.objective !== boundary.objective)
    throw new Error("A refinement must preserve the selected layout objective.");
  const protectedConstraints = boundary.constraints.filter(
    (c) => panel || c.type === "direction",
  );
  if (
    protectedConstraints.some(
      (constraint) => !intent.constraints.some((c) => JSON.stringify(c) === JSON.stringify(constraint)),
    )
  )
    throw new Error(
      "The proposal removed a requested constraint. Selected preferences must be preserved.",
    );
}
