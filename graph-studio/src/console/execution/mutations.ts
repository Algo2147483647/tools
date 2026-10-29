import { type CommandResult, applyGraphCommand } from "../../graph/commands";
import type { NormalizedDag } from "../../graph/types";
import type { ConsoleInstruction } from "../instructions";

import { resolveExistingNodeKey, syncUiEffects } from "./context";
import type { ConsoleUiEffect } from "./types";

export function executeConsoleMutation(
  instruction: ConsoleInstruction,
  context: {
    referenceTime?: number;
    workingDag: NormalizedDag;
    results: CommandResult[];
    uiEffects: ConsoleUiEffect[];
    outputMessages: string[];
  },
) {
  let { workingDag } = context;
  const { results, uiEffects, outputMessages } = context;
  const apply = (dag: NormalizedDag, command: Parameters<typeof applyGraphCommand>[1]) =>
    applyGraphCommand(dag, command, context.referenceTime);
  switch (instruction.type) {
    case "rename": {
      const oldKey = resolveExistingNodeKey(instruction.oldKey, workingDag);
      const result = apply(workingDag, { type: "renameNode", oldKey, newKey: instruction.newKey });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "delete": {
      const key = resolveExistingNodeKey(instruction.key, workingDag);
      const result = apply(
        workingDag,
        instruction.recursive ? { type: "deleteSubtree", rootKey: key } : { type: "deleteNode", key },
      );
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "add": {
      const parentKey = instruction.parentKey ? resolveExistingNodeKey(instruction.parentKey, workingDag) : undefined;
      const result = apply(workingDag, { type: "addNode", key: instruction.key, parentKey });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "copy": {
      const sourceKey = resolveExistingNodeKey(instruction.sourceKey, workingDag);
      const parentKey = instruction.parentKey ? resolveExistingNodeKey(instruction.parentKey, workingDag) : undefined;
      const result = apply(workingDag, {
        type: "copyNode",
        sourceKey,
        key: instruction.key,
        parentKey,
      });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setEdge": {
      const parentKey = instruction.createMissing
        ? instruction.parentKey
        : resolveExistingNodeKey(instruction.parentKey, workingDag);
      const childKey = instruction.createMissing
        ? instruction.childKey
        : resolveExistingNodeKey(instruction.childKey, workingDag);
      if (instruction.createMissing) {
        [parentKey, childKey].forEach((key) => {
          if (!workingDag.nodes[key]) {
            const addResult = apply(workingDag, { type: "addNode", key });
            workingDag = addResult.dag;

            syncUiEffects(uiEffects, addResult);
            results.push(addResult);
          }
        });
      }
      const result = apply(workingDag, {
        type: "setEdge",
        parentKey,
        childKey,
        weight: instruction.weight,
      });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "removeEdge": {
      const parentKey = resolveExistingNodeKey(instruction.parentKey, workingDag);
      const childKey = resolveExistingNodeKey(instruction.childKey, workingDag);
      const result = apply(workingDag, { type: "removeEdge", parentKey, childKey });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setParents": {
      const key = resolveExistingNodeKey(instruction.key, workingDag);
      const parents = instruction.keys.map((item) => resolveExistingNodeKey(item, workingDag));
      const result = apply(workingDag, { type: "setParents", key, parents });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setChildren": {
      const key = resolveExistingNodeKey(instruction.key, workingDag);
      const children = instruction.keys.map((item) => resolveExistingNodeKey(item, workingDag));
      const result = apply(workingDag, { type: "setChildren", key, children });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setField": {
      const key = resolveExistingNodeKey(instruction.key, workingDag);
      if (instruction.field === "key") {
        throw new Error("Use node_rename to rename a node ID.");
      }
      if (instruction.field === "parents" || instruction.field === "children") {
        throw new Error(`Use node_${instruction.field}_replace to replace relation sets.`);
      }
      const currentNode = workingDag.nodes[key];
      if (!currentNode) {
        throw new Error(`Node "${key}" does not exist.`);
      }
      const { key: _oldKey, ...fields } = structuredClone(currentNode);
      Object.defineProperty(fields, instruction.field, {
        value: instruction.value,
        enumerable: true,
        writable: true,
        configurable: true,
      });
      const result = apply(workingDag, { type: "updateNodeFields", key, fields });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "unsetField": {
      const key = resolveExistingNodeKey(instruction.key, workingDag);
      if (instruction.field === "key") {
        throw new Error("Use node_rename to rename a node ID.");
      }
      if (instruction.field === "parents" || instruction.field === "children") {
        throw new Error(`Use node_${instruction.field}_replace or edge_remove to edit relation fields.`);
      }
      const currentNode = workingDag.nodes[key];
      if (!currentNode) {
        throw new Error(`Node "${key}" does not exist.`);
      }
      if (!Object.prototype.hasOwnProperty.call(currentNode, instruction.field)) {
        outputMessages.push(`Node "${key}" has no field named "${instruction.field}".`);
        break;
      }
      const { key: _oldKey, ...fields } = structuredClone(currentNode);
      delete fields[instruction.field];
      const result = apply(workingDag, { type: "updateNodeFields", key, fields });
      workingDag = result.dag;

      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    default:
      throw new Error("Unsupported graph mutation.");
  }
  return { workingDag };
}
