import { type HierarchyCommand } from "../compound/hierarchy";

import type { CommandContext } from "./context";
import type { NodeCommand } from "./nodes";
import type { GraphCommand } from "./types";
type RelationCommand = Exclude<GraphCommand, NodeCommand | HierarchyCommand>;
export function applyRelationCommand(context: CommandContext, command: RelationCommand): void {
  const { document, defaultRelationValue, result, requireNode, setEdge } = context;
  switch (command.type) {
    case "setEdge":
      setEdge(
        command.parentKey,
        command.childKey,
        command.weight === undefined ? defaultRelationValue : command.weight,
      );
      result.message = `Updated edge ${command.parentKey} -> ${command.childKey}.`;
      break;
    case "removeEdge": {
      requireNode(command.parentKey);
      requireNode(command.childKey);
      const count = document.edges.length;
      document.edges = document.edges.filter(
        (edge) => edge.source !== command.parentKey || edge.target !== command.childKey,
      );
      if (count === document.edges.length) throw new Error("Edge does not exist.");
      result.message = "Removed edge.";
      break;
    }
    default: {
      requireNode(command.key);
      const parents = command.type === "setParents" || command.type === "setParentRelations";
      const oldEdges = document.edges.filter((edge) => (parents ? edge.target : edge.source) === command.key);
      const values =
        command.type === "setParents"
          ? command.parents
          : command.type === "setChildren"
            ? command.children
            : command.type === "setParentRelations"
              ? command.parents
              : command.children;
      const relations = Array.isArray(values)
        ? Object.fromEntries(
            values.map((key) => {
              const value = oldEdges.find((edge) => (parents ? edge.source : edge.target) === key)?.value;
              return [key, value === undefined ? defaultRelationValue : value];
            }),
          )
        : values;
      for (const [key, value] of Object.entries(relations))
        setEdge(parents ? key : command.key, parents ? command.key : key, value);
      document.edges = document.edges.filter(
        (edge) =>
          (parents ? edge.target : edge.source) !== command.key ||
          Object.prototype.hasOwnProperty.call(relations, parents ? edge.source : edge.target),
      );
      result.message = `Updated ${parents ? "parents" : "children"} for ${command.key}.`;
    }
  }
}
