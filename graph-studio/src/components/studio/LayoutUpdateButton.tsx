import type { StudioViewProps } from "./types";
export function LayoutUpdateButton({
  files,
  viewport,
  busy = false,
}: Pick<StudioViewProps, "files" | "viewport"> & { busy?: boolean }) {
  return (
    <button
      type="button"
      className="studio-button"
      disabled={!viewport.currentLayoutDocument || files.busy || busy}
      onClick={() => {
        if (viewport.currentLayoutDocument) void files.saveAndBindLayout(viewport.currentLayoutDocument);
      }}
    >
      {files.busy ? "Updating…" : "Update current layout"}
    </button>
  );
}
