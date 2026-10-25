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
      disabled={!viewport.currentLayoutConfig || files.busy || busy}
      onClick={() => {
        if (viewport.currentLayoutConfig) void files.saveAndBindLayout(viewport.currentLayoutConfig);
      }}
    >
      {files.busy ? "Updating…" : "Update current layout"}
    </button>
  );
}
