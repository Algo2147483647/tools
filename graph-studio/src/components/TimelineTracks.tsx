import { useEffect, useRef } from "react";

export default function TimelineTracks({
  tracks,
  collapsedTracks,
  onToggle,
  onExpandAll,
}: {
  tracks: string[];
  collapsedTracks: string[];
  onToggle: (id: string) => void;
  onExpandAll: () => void;
}) {
  const details = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (details.current?.open && event.target instanceof Node && !details.current.contains(event.target))
        details.current.open = false;
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  const collapsed = tracks.filter((id) => collapsedTracks.includes(id)).length;
  return (
    <details
      ref={details}
      className="timeline-tracks"
      onKeyDown={(event) => {
        if (event.key === "Escape" && details.current) {
          event.stopPropagation();
          details.current.open = false;
          details.current.querySelector("summary")?.focus();
        }
      }}
    >
      <summary className="timeline-tracks-summary" aria-label="Manage timeline tracks">
        Tracks{" "}
        <span>
          {tracks.length - collapsed}/{tracks.length}
        </span>
      </summary>
      <div className="timeline-tracks-popover" role="group" aria-label="Visible timeline tracks">
        <div className="timeline-tracks-heading">
          <strong>Tracks</strong>
          <button type="button" onClick={onExpandAll} disabled={!collapsed}>
            Expand all
          </button>
        </div>
        <p>Collapse tracks to make room. Dates stay aligned.</p>
        <div className="timeline-tracks-list">
          {tracks.map((track) => (
            <label key={track} title={track}>
              <input type="checkbox" checked={!collapsedTracks.includes(track)} onChange={() => onToggle(track)} />
              <span>{track}</span>
            </label>
          ))}
        </div>
      </div>
    </details>
  );
}
