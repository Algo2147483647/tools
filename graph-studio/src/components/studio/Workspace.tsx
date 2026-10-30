import { useState } from "react";
import type { GraphAppearance } from "../../schema/appearance/defaults";
import type { StageData } from "../../layout/shared/types";
import GraphStage from "../canvas/GraphStage";
import Icon from "../ui/Icon";
import EmptyState from "./EmptyState";

interface WorkspaceProps {
  onGroupToggle?: (id: string) => void;
  onGroupEnter?: (id: string) => void;
  containerRef: React.RefObject<HTMLDivElement>;
  overlaysRef: React.RefObject<HTMLDivElement>;
  svgRef: React.RefObject<SVGSVGElement>;
  stage: StageData | null;
  documentGeneration: number;
  status: string;
  explorer?: React.ReactNode;
  emptyContent?: React.ReactNode;
  appearance: GraphAppearance;
  onInitializeCanvas: () => void;
  focusedKey: string | null;
  hideNodeBorders: boolean;
  onTimelineNodePin?: (key: string, x: number) => void;
  onNodeClick: (key: string) => void;
  onNodeDoubleClick: (key: string) => void;
  onCanvasContextMenu: (event: React.MouseEvent<Element>) => void;
  onFocusChange: (key: string | null) => void;
}

export default function Workspace({
  containerRef,
  overlaysRef,
  svgRef,
  stage,
  documentGeneration,
  status,
  explorer,
  emptyContent,
  appearance,
  onInitializeCanvas,
  focusedKey,
  hideNodeBorders,
  onTimelineNodePin,
  onNodeClick,
  onNodeDoubleClick,
  onCanvasContextMenu,
  onFocusChange,
  onGroupToggle,
  onGroupEnter,
}: WorkspaceProps) {
  return (
    <main id="workspace" className="workspace">
      <div className="workspace-split-shell">
        <div ref={overlaysRef} className="workspace-overlays">
          {explorer}
        </div>
        <div className="workspace-stage-shell">
          {stage && stage.layoutMode !== "compound" && stage.warnings.length > 0 && (
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
            data-layout={stage?.layoutMode}
            aria-live="polite"
            onContextMenu={onCanvasContextMenu}
            onClick={(event) => {
              if (
                event.defaultPrevented ||
                (event.target instanceof Element &&
                  event.target.closest(".dag-node, .dag-group-controls, button, a, input, select, textarea"))
              )
                return;
              const active = document.activeElement;
              if (
                (active instanceof HTMLElement || active instanceof SVGElement) &&
                event.currentTarget.contains(active)
              )
                active.blur();
              onFocusChange(null);
            }}
          >
            {stage ? (
              <GraphStage
                overlaysRef={overlaysRef}
                onGroupToggle={onGroupToggle}
                onGroupEnter={onGroupEnter}
                stage={stage}
                focusedKey={focusedKey}
                hideNodeBorders={hideNodeBorders}
                appearance={appearance}
                svgRef={svgRef}
                onTimelineNodePin={onTimelineNodePin}
                onNodeClick={onNodeClick}
                onNodeDoubleClick={onNodeDoubleClick}
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
        <Icon name="close" className="modal-icon-close-svg" />
      </button>
    </div>
  );
}
