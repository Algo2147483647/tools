import { useEffect,useRef,type ReactNode } from "react";

export default function SubgraphsPanel({
  open,
  onClose,
  tab,
  onTabChange,
  structure,
  arrange,
}: {
  open: boolean;
  onClose(): void;
  tab: "structure" | "arrange";
  onTabChange(tab: "structure" | "arrange"): void;
  structure: ReactNode;
  arrange: ReactNode;
}) {
  const panel = useRef<HTMLElement>(null);
  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);
  const close = () => {
    onClose();
    document.getElementById("subgraphs-toggle")?.focus();
  };
  return (
    <aside
      id="subgraphs-panel"
      className="arrange-panel subgraphs-floating-panel"
      aria-label="Subgraphs"
      hidden={!open}
      tabIndex={-1}
      ref={panel}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          close();
        }
      }}
    >
      <div className="subgraphs-panel-toolbar">
        <div
          className="subgraph-tabs"
          role="tablist"
          aria-label="Subgraph tools"
          onKeyDown={(event) => {
            if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
              event.preventDefault();
              const next =
                event.key === "Home"
                  ? "structure"
                  : event.key === "End"
                    ? "arrange"
                    : tab === "structure"
                      ? "arrange"
                      : "structure";
              onTabChange(next);
              document.getElementById(`subgraphs-${next}-tab`)?.focus();
            }
          }}
        >
          {(["structure", "arrange"] as const).map((name) => (
            <button
              key={name}
              id={`subgraphs-${name}-tab`}
              role="tab"
              aria-selected={tab === name}
              aria-controls={`subgraphs-${name}-content`}
              tabIndex={tab === name ? 0 : -1}
              onClick={() => onTabChange(name)}
            >
              {name === "structure" ? "Structure" : "Arrange"}
            </button>
          ))}
        </div>
        <button className="arrange-close" aria-label="Close Subgraphs panel" onClick={close}>
          ×
        </button>
      </div>
      <div
        id="subgraphs-structure-content"
        role="tabpanel"
        aria-labelledby="subgraphs-structure-tab"
        hidden={tab !== "structure"}
      >
        {structure}
      </div>
      <div
        id="subgraphs-arrange-content"
        role="tabpanel"
        aria-labelledby="subgraphs-arrange-tab"
        hidden={tab !== "arrange"}
      >
        {arrange}
      </div>
    </aside>
  );
}
