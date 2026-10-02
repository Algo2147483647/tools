import type { GraphAction } from "./graphActions";
import type { GraphAppState } from "./initialState";
interface SavePorts {
  requestPermission(handle: FileSystemFileHandle): Promise<boolean>;
  write(handle: FileSystemFileHandle, content: string): Promise<void>;
}
// Serialize writes even when the user switches documents during a pending write.
export function createDocumentSaver(ports: SavePorts) {
  let running = false;
  return async (state: GraphAppState, content: string, isCurrent: () => boolean): Promise<GraphAction | null> => {
    const handle = state.source.fileHandle;
    if (running || !handle || !state.dag) return null;
    running = true;
    try {
      const granted = await ports.requestPermission(handle);
      if (!isCurrent()) return null;
      if (!granted)
        return { type: "statusChanged", status: "Write permission was not granted for the source JSON file." };
      await ports.write(handle, content);
      if (!isCurrent()) return null;
      return {
        type: "saved",
        generation: state.document.generation,
        revision: state.editHistory.revision,
        dag: state.dag,
        status: "Saved JSON to " + (state.source.fileName || handle.name) + ".",
      };
    } catch {
      return isCurrent()
        ? { type: "statusChanged", status: "Unable to overwrite " + (state.source.fileName || handle.name) + "." }
        : null;
    } finally {
      running = false;
    }
  };
}
