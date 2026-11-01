import { useEffect, useSyncExternalStore } from "react";
import { localJson } from "./localApi";

export type FileOpenMode = "preview" | "external";
export interface GeneralPreferences {
  fileOpenMode: FileOpenMode;
}
let state = { fileOpenMode: "preview" as FileOpenMode, loaded: false, saving: false, error: "" };
let loading: Promise<GeneralPreferences> | undefined;
const listeners = new Set<() => void>();
function publish(next: typeof state) {
  state = next;
  listeners.forEach((listener) => listener());
}
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const snapshot = () => state;

export function loadGeneralPreferences(): Promise<GeneralPreferences> {
  return (loading ||= localJson<GeneralPreferences>("/preferences")
    .then((preferences) => {
      publish({ ...state, ...preferences, loaded: true, error: "" });
      return preferences;
    })
    .catch((error) => {
      publish({ ...state, error: error instanceof Error ? error.message : String(error) });
      throw error;
    })
    .finally(() => {
      loading = undefined;
    }));
}

async function setFileOpenMode(fileOpenMode: FileOpenMode) {
  if (state.saving) return;
  const previous = state.fileOpenMode;
  publish({ ...state, fileOpenMode, saving: true, error: "" });
  try {
    if (loading) await loading;
    const preferences = await localJson<GeneralPreferences>("/preferences", "PATCH", { fileOpenMode });
    publish({ ...state, ...preferences, loaded: true, saving: false, error: "" });
  } catch (error) {
    publish({
      ...state,
      fileOpenMode: previous,
      saving: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function useGeneralPreferences() {
  const current = useSyncExternalStore(subscribe, snapshot, snapshot);
  useEffect(() => {
    void loadGeneralPreferences().catch(() => {});
  }, []);
  return { ...current, setFileOpenMode };
}
