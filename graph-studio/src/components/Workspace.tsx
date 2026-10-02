import { useState } from "react";
import type { GraphAppearance } from "../graph/appearance";
import type { StageData } from "../layout/types";
import GraphStage from "../rendering/GraphStage";
import EmptyState from "./EmptyState";
import { CloseIcon } from "./ui/ModalIcons";

interface WorkspaceProps {
  compoundTools?: React.ReactNode;
  onGroupToggle?: (id: string) => void;
  onGroupEnter?: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  stage: StageData | null;
  documentGeneration: number;
  status: string;
  explorer?: React.ReactNode;
  emptyContent?: React.ReactNode;
  sidebar: React.ReactNode;
  sidebarOpen: boolean;
  sidebarWidth: number;
  appearance: GraphAppearance;
  onInitializeCanvas: () => void;
  focusedKey: string | null;
  hideNodeBorders: boolean;
  onNodeClick: (key: string) => void;
  onNodeDoubleClick: (key: string) => void;
  onNodeContextMenu: (event: React.MouseEvent<SVGGElement>, key: string) => void;
  onBackgroundContextMenu: (event: React.MouseEvent<Element>) => void;
  onFocusChange: (key: string | null) => void;
  onScroll: () => void;
  onSidebarResizeStart: (event: React.PointerEvent<HTMLDivElement>) => void;
}

export default function Workspace({
  containerRef,
  svgRef,
  stage,
  documentGeneration,
  status,
  explorer,
  emptyContent,
  sidebar,
  sidebarOpen,
  sidebarWidth,
  appearance,
  onInitializeCanvas,
  focusedKey,
  hideNodeBorders,
  onNodeClick,
  onNodeDoubleClick,
  onNodeContextMenu,
  onBackgroundContextMenu,
  onFocusChange,
  onScroll,
  onSidebarResizeStart,
  compoundTools,
  onGroupToggle,
  onGroupEnter,
}: WorkspaceProps) {
  return (
    <main id="workspace" className={`workspace${sidebarOpen ? " workspace--split" : ""}`}>
      <div className="workspace-split-shell">
        <div className="workspace-overlays">
          {explorer}
          {compoundTools}
          {sidebarOpen ? (
            <>
              <aside className="workspace-sidebar-shell" style={{ width: sidebarWidth }}>
                {sidebar}
              </aside>
              <div
                className="workspace-sidebar-resizer"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize console sidebar"
                onPointerDown={onSidebarResizeStart}
              />
            </>
          ) : null}
        </div>
        <div className="workspace-stage-shell">
          {stage && stage.warnings.length > 0 && (
            <StageWarning
              key={JSON.stringify([documentGeneration, stage.layoutMode, stage.warnings])}
              message={stage.warnings.join(" ")}
            />
          )}
          {!stage &&
            (emptyContent || (
              <EmptyState
                message={status || "This graph has no nodes."}
                hidden={false}
                actionLabel="Create a graph"
                onAction={onInitializeCanvas}
              />
            ))}
          <div
            id="main-content"
            ref={containerRef}
            className={stage ? "is-ready" : ""}
            aria-live="polite"
            onScroll={onScroll}
            onContextMenu={onBackgroundContextMenu}
          >
            {stage ? (
              <GraphStage
                onGroupToggle={onGroupToggle}
                onGroupEnter={onGroupEnter}
                stage={stage}
                focusedKey={focusedKey}
                hideNodeBorders={hideNodeBorders}
                appearance={appearance}
                svgRef={svgRef}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
                onNodeContextMenu={onNodeContextMenu}
                onBackgroundContextMenu={onBackgroundContextMenu}
                onFocusChange={onFocusChange}
              />
            ) : null}
          </div>
        </div>
      </div>
    </main>
  );
}

function StageWarning({ message }: { message: string }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return (
    <div className="stage-warning" role="status">
      <span>{message}</span>
      <button
        type="button"
        aria-label="Dismiss layout warning"
        title="Dismiss layout warning"
        onClick={() => setDismissed(true)}
      >
        <CloseIcon />
      </button>
    </div>
  );
}
