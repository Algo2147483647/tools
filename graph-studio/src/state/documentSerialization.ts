import { serializeDag } from "../graph/serialize";
import type { NormalizedDag } from "../graph/types";

export function serializeDagToJson(dag: NormalizedDag): string {
  return JSON.stringify(serializeDag(dag), null, 2);
}
