import { createGraphDocument } from "./normalize";
import type { FieldMapping } from "./fieldMapping";

export const INITIAL_CANVAS_NODE_KEY = "Initial_Node";
export const INITIAL_CANVAS_FILE_NAME = "untitled-graph.json";

export function createInitialCanvasDag(_mapping?: FieldMapping) {
  return createGraphDocument({ [INITIAL_CANVAS_NODE_KEY]: { define: "Start building your graph from this root node." } });
}
