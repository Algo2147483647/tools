import GraphStage from "../rendering/GraphStage";
import type { StageData } from "../layout/types";
import type { GraphAppearance } from "../graph/appearance";
import EmptyState from "./EmptyState";

interface WorkspaceProps {
  containerRef: React.RefObject<HTMLDivElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  stage: StageData | null;
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
}: WorkspaceProps) {
  return (
    <main id="workspace" className={`workspace${sidebarOpen ? " workspace--split" : ""}`}>
      <div className="workspace-split-shell">
        {explorer}
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
        <div className="workspace-stage-shell">
          {!stage && (emptyContent || <EmptyState message={status || "This graph has no nodes."} hidden={false} actionLabel="Create a graph" onAction={onInitializeCanvas} />)}
          <div id="main-content" ref={containerRef} className={stage ? "is-ready" : ""} aria-live="polite" onScroll={onScroll} onContextMenu={onBackgroundContextMenu}>
            {stage ? (
              <GraphStage
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
