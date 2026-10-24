import { type CommandResult } from "../../graph/commands";
import type { NodeKey, NormalizedDag } from "../../graph/types";
import type { ConsoleNodeOperand } from "../syntax/types";

import type { ConsoleUiEffect } from "./types";
export function resolveExistingNodeKey(
  operand: ConsoleNodeOperand,
  contextNodeKey: NodeKey | null,
  dag: NormalizedDag,
  line: number,
): NodeKey {
  const key = operand.type === "context" ? contextNodeKey : operand.value;
  if (!key) {
    throw new Error(`Line ${line}: Current context is empty. Use "use <node>" first.`);
  }
  if (!dag.nodes[key]) {
    throw new Error(`Node "${key}" does not exist.`);
  }
  return key;
}

export function resolveOrCreateNodeKey(
  operand: ConsoleNodeOperand,
  contextNodeKey: NodeKey | null,
  line: number,
): NodeKey {
  const key = operand.type === "context" ? contextNodeKey : operand.value;
  if (!key) {
    throw new Error(`Line ${line}: Current context is empty. Use "use <node>" first.`);
  }
  return key;
}

export function remapContextKey(contextNodeKey: NodeKey | null, result: CommandResult): NodeKey | null {
  if (!contextNodeKey) {
    return null;
  }
  if (result.renamedKey && contextNodeKey === result.renamedKey.from) {
    return result.renamedKey.to;
  }
  if (result.deletedKeys?.includes(contextNodeKey)) {
    return null;
  }
  return contextNodeKey;
}

export function syncUiEffects(effects: ConsoleUiEffect[], result: CommandResult): void {
  const deleted = new Set(result.deletedKeys || []);
  effects.forEach((effect, index) => {
    if (result.renamedKey && effect.nodeKey === result.renamedKey.from) {
      effects[index] = { ...effect, nodeKey: result.renamedKey.to };
      return;
    }
    if (deleted.has(effect.nodeKey)) {
      effects[index] = { ...effect, nodeKey: "" };
    }
  });
}
