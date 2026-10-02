import type { CommandResult } from "./commands";
import type { NodeKey } from "./types";

export function collectBatchEffects(results: CommandResult[]): {
  renamedKeys: Array<{ from: NodeKey; to: NodeKey }>;
  deletedKeys: NodeKey[];
} {
  const renamedKeys: Array<{ from: NodeKey; to: NodeKey }> = [];
  const deletedKeys = new Set<NodeKey>();

  results.forEach((result) => {
    if (result.renamedKey) {
      renamedKeys.push(result.renamedKey);
    }
    result.deletedKeys?.forEach((key) => deletedKeys.add(key));
  });

  return { renamedKeys, deletedKeys: Array.from(deletedKeys) };
}
