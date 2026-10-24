import { type CommandResult, applyGraphCommand } from "../../graph/commands";
import type { NodeKey, NormalizedDag } from "../../graph/types";
import type { ConsoleInstruction } from "../syntax/types";

import { remapContextKey, resolveExistingNodeKey, resolveOrCreateNodeKey, syncUiEffects } from "./context";
import type { ConsoleUiEffect } from "./types";

export function executeConsoleMutation(
  instruction: ConsoleInstruction,
  context: {
    workingDag: NormalizedDag;
    contextNodeKey: NodeKey | null;
    results: CommandResult[];
    uiEffects: ConsoleUiEffect[];
    outputMessages: string[];
  },
) {
  let { workingDag, contextNodeKey } = context;
  const { results, uiEffects, outputMessages } = context;
  switch (instruction.type) {
    case "rename": {
      const oldKey = resolveExistingNodeKey(instruction.oldKey, contextNodeKey, workingDag, instruction.line);
      const result = applyGraphCommand(workingDag, { type: "renameNode", oldKey, newKey: instruction.newKey });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "delete": {
      const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
      const result = applyGraphCommand(
        workingDag,
        instruction.recursive ? { type: "deleteSubtree", rootKey: key } : { type: "deleteNode", key },
      );
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "add": {
      const parentKey = instruction.parentKey
        ? resolveExistingNodeKey(instruction.parentKey, contextNodeKey, workingDag, instruction.line)
        : undefined;
      const result = applyGraphCommand(workingDag, { type: "addNode", key: instruction.key, parentKey });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "copy": {
      const sourceKey = resolveExistingNodeKey(instruction.sourceKey, contextNodeKey, workingDag, instruction.line);
      const parentKey = instruction.parentKey
        ? resolveExistingNodeKey(instruction.parentKey, contextNodeKey, workingDag, instruction.line)
        : undefined;
      const result = applyGraphCommand(workingDag, {
        type: "copyNode",
        sourceKey,
        key: instruction.key,
        parentKey,
      });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setEdge": {
      const parentKey = instruction.createMissing
        ? resolveOrCreateNodeKey(instruction.parentKey, contextNodeKey, instruction.line)
        : resolveExistingNodeKey(instruction.parentKey, contextNodeKey, workingDag, instruction.line);
      const childKey = instruction.createMissing
        ? resolveOrCreateNodeKey(instruction.childKey, contextNodeKey, instruction.line)
        : resolveExistingNodeKey(instruction.childKey, contextNodeKey, workingDag, instruction.line);
      if (instruction.createMissing) {
        [parentKey, childKey].forEach((key) => {
          if (!workingDag.nodes[key]) {
            const addResult = applyGraphCommand(workingDag, { type: "addNode", key });
            workingDag = addResult.dag;
            contextNodeKey = remapContextKey(contextNodeKey, addResult);
            syncUiEffects(uiEffects, addResult);
            results.push(addResult);
          }
        });
      }
      const result = applyGraphCommand(workingDag, {
        type: "setEdge",
        parentKey,
        childKey,
        weight: instruction.weight,
      });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "removeEdge": {
      const parentKey = resolveExistingNodeKey(instruction.parentKey, contextNodeKey, workingDag, instruction.line);
      const childKey = resolveExistingNodeKey(instruction.childKey, contextNodeKey, workingDag, instruction.line);
      const result = applyGraphCommand(workingDag, { type: "removeEdge", parentKey, childKey });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setParents": {
      const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
      const parents = instruction.keys.map((item) =>
        resolveExistingNodeKey(item, contextNodeKey, workingDag, instruction.line),
      );
      const result = applyGraphCommand(workingDag, { type: "setParents", key, parents });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setChildren": {
      const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
      const children = instruction.keys.map((item) =>
        resolveExistingNodeKey(item, contextNodeKey, workingDag, instruction.line),
      );
      const result = applyGraphCommand(workingDag, { type: "setChildren", key, children });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "setField": {
      const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
      if (instruction.field === "key") {
        throw new Error("Use mv to rename a node key.");
      }
      if (instruction.field === "parents" || instruction.field === "children") {
        throw new Error(`Use ${instruction.field} to replace relation sets.`);
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
      const result = applyGraphCommand(workingDag, { type: "updateNodeFields", key, fields });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    case "unsetField": {
      const key = resolveExistingNodeKey(instruction.key, contextNodeKey, workingDag, instruction.line);
      if (instruction.field === "key") {
        throw new Error("Use mv to rename a node key.");
      }
      if (instruction.field === "parents" || instruction.field === "children") {
        throw new Error(`Use ${instruction.field} or rm-edge to edit relation fields.`);
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
      const result = applyGraphCommand(workingDag, { type: "updateNodeFields", key, fields });
      workingDag = result.dag;
      contextNodeKey = remapContextKey(contextNodeKey, result);
      syncUiEffects(uiEffects, result);
      results.push(result);
      break;
    }
    default:
      throw new Error("Unsupported graph mutation.");
  }
  return { workingDag, contextNodeKey };
}
