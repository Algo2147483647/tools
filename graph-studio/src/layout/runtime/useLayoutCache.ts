import { useRef } from "react";
import { LayoutCache } from "./cache";

export function useLayoutCache<T>(documentIdentity: number) {
  const state = useRef({ documentIdentity, cache: new LayoutCache<T>() });
  if (state.current.documentIdentity !== documentIdentity)
    state.current = { documentIdentity, cache: new LayoutCache<T>() };
  return state.current.cache;
}
