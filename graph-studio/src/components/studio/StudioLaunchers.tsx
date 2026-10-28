import { useRef, useState } from "react";
import type { WorkspaceControls } from "../../app/workspace/workspaceControls";
import Icon from "../ui/Icon";

interface StudioLaunchersProps {
  files: WorkspaceControls;
  consoleAvailable: boolean;
  consoleOpen: boolean;
  settingsOpen: boolean;
  onConsole(): void;
  onSettings(): void;
}

export default function StudioLaunchers({
  files,
  consoleAvailable,
  consoleOpen,
  settingsOpen,
  onConsole,
  onSettings,
}: StudioLaunchersProps) {
  const [expanded, setExpanded] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const activate = (action: () => void) => {
    setExpanded(false);
    trigger.current?.focus();
    action();
  };
  return (
    <>
      {files.workspace && !files.homeVisible && !files.explorerOpen && (
        <button
          className="studio-bubble explorer-launcher"
          aria-label="Open workspace explorer"
          title="Workspace files"
          onClick={() => files.setExplorerOpen(true)}
        >
          <Icon name="folder" />
        </button>
      )}
      <div
        className="studio-launchers"
        onPointerEnter={(event) => {
          if (event.pointerType === "mouse") setExpanded(true);
        }}
        onPointerLeave={(event) => {
          if (!event.currentTarget.contains(document.activeElement)) setExpanded(false);
        }}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setExpanded(false);
            trigger.current?.focus();
          }
        }}
      >
        <button
          ref={trigger}
          id="studio-launcher"
          className="studio-bubble"
          aria-label="Console and settings"
          title="Console and settings"
          aria-expanded={expanded}
          aria-controls="studio-launcher-actions"
          onClick={() => setExpanded((value) => !value)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setExpanded(true);
              requestAnimationFrame(() =>
                document.querySelector<HTMLButtonElement>("#studio-launcher-actions button:not(:disabled)")?.focus(),
              );
            }
          }}
        >
          <Icon name="ai" size={22} />
        </button>
        <div id="studio-launcher-actions" className="studio-launcher-actions" hidden={!expanded}>
          <button
            id="console-toggle"
            disabled={!consoleAvailable}
            aria-expanded={consoleOpen}
            aria-controls="graph-console"
            onClick={() => activate(onConsole)}
          >
            <Icon name="workbench" size={18} />
            <span>Console</span>
          </button>
          <button
            id="settings-btn"
            aria-expanded={settingsOpen}
            aria-controls="settings-modal"
            onClick={() => activate(onSettings)}
          >
            <Icon name="sliders" size={18} />
            <span>Settings</span>
          </button>
        </div>
      </div>
    </>
  );
}
