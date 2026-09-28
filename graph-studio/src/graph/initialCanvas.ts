import { normalizeDagInput } from "./normalize";
import { getDefaultFieldMapping, getMappedFieldName, type FieldMapping } from "./fieldMapping";

export const INITIAL_CANVAS_NODE_KEY = "Initial_Node";
export const INITIAL_CANVAS_FILE_NAME = "untitled-graph.json";

export function createInitialCanvasDag(mapping: FieldMapping = getDefaultFieldMapping()) {
  return normalizeDagInput({
    [INITIAL_CANVAS_NODE_KEY]: {
      [getMappedFieldName(mapping, "define")]: "Start building your graph from this root node.",
      [getMappedFieldName(mapping, "parents")]: {},
      [getMappedFieldName(mapping, "children")]: {},
    },
  });
}
