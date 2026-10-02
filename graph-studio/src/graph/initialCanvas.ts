import { createGraphDocument } from "./normalize";

const INITIAL_CANVAS_NODE_KEY = "Initial_Node";
export const INITIAL_CANVAS_FILE_NAME = "untitled-graph.json";

export function createInitialCanvasDag() {
  return createGraphDocument({
    [INITIAL_CANVAS_NODE_KEY]: { define: "Start building your graph from this root node." },
  });
}
