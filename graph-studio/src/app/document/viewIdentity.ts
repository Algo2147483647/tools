import type { GraphAppState } from "./initialState";
import { graphLayoutIdentity } from "../../schema/layoutGeometry";

/** Durable file identity, including content when imports have no filesystem handle. */
export function documentViewIdentity(state: GraphAppState) {
  return state.source.fileHandle || !state.document.savedDag
    ? state.document.id
    : JSON.stringify(["import", state.source.fileName, graphLayoutIdentity(state.document.savedDag)]);
}
