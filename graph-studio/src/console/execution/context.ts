import { type CommandResult } from "../../graph/commands";
import type { NodeKey, NormalizedDag } from "../../graph/types";
import type { ConsoleNodeOperand } from "../instructions";

import type { ConsoleUiEffect } from "./types";
export function resolveExistingNodeKey(key: ConsoleNodeOperand, dag: NormalizedDag): NodeKey {
  if (!Object.prototype.hasOwnProperty.call(dag.nodes, key)) throw new Error(`Node "${key}" does not exist.`);
  return key;
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
