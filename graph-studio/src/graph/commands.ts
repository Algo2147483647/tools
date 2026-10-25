import { normalizeDagInput } from "./normalize";
import { serializeDag } from "./serialize";
import { applyHierarchyCommand } from "./compound/hierarchy";
import { getTimelineReferenceTime } from "./timeline/editing";
import type { NormalizedDag } from "./types";

import type { GraphCommand, CommandResult } from "./commands/types";
import { createCommandContext } from "./commands/context";
import { applyNodeCommand, isNodeCommand } from "./commands/nodes";
import { applyRelationCommand } from "./commands/relations";
export type { GraphCommand, CommandResult } from "./commands/types";
export { collectSubtreeNodeKeys } from "./commands/nodes";
export function applyGraphCommand(source: NormalizedDag, command: GraphCommand): CommandResult {
  const document = serializeDag(source);
  const timelineReferenceTime = getTimelineReferenceTime(document);
  if (
    command.type === "groupCreate" ||
    command.type === "groupMove" ||
    command.type === "groupRename" ||
    command.type === "groupDissolve"
  ) {
    applyHierarchyCommand(document, command);
    return { dag: normalizeDagInput(document), changedKeys: [], message: "Updated subgraph hierarchy." };
  }
  const context = createCommandContext(source, document, timelineReferenceTime);
  if (isNodeCommand(command)) applyNodeCommand(context, command);
  else applyRelationCommand(context, command);
  const { result } = context;
  const dag = normalizeDagInput(document);
  return { ...result, dag, changedKeys: Object.keys(dag.nodes) };
}
