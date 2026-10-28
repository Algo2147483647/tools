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
  const actions = useRef<HTMLDivElement>(null);
  const collapse = () => {
    setExpanded(false);
    if (actions.current?.contains(document.activeElement)) trigger.current?.focus();
  };
  const activate = (action: () => void) => {
    collapse();
    action();
  };
  const openWithKeyboard = () => {
    setExpanded(true);
    requestAnimationFrame(() => actions.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus());
  };
  return (
    <div
      className={`studio-launchers${expanded ? " is-expanded" : ""}`}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") setExpanded(true);
      }}
      onPointerLeave={collapse}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setExpanded(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.stopPropagation();
          collapse();
          trigger.current?.focus();
        }
      }}
    >
      <button
        ref={trigger}
        id="studio-launcher"
        className="studio-bubble"
        aria-label="Workspace controls"
        title="Workspace controls"
        aria-expanded={expanded}
        aria-controls="studio-launcher-actions"
        aria-hidden={expanded}
        tabIndex={expanded ? -1 : 0}
        onClick={openWithKeyboard}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openWithKeyboard();
          }
        }}
      >
        <Icon name="ai" size={22} />
      </button>
      <div
        ref={actions}
        id="studio-launcher-actions"
        className="studio-launcher-actions"
        hidden={!expanded}
        role="group"
        aria-label="Workspace controls"
      >
        <button
          id="explorer-toggle"
          aria-label="Workspace files"
          title="Workspace files"
          disabled={!files.workspace || files.homeVisible}
          aria-expanded={files.explorerOpen && !files.homeVisible}
          aria-controls="workspace-explorer"
          onClick={() => activate(() => files.setExplorerOpen((value) => !value))}
        >
          <Icon name="folder" size={18} />
        </button>
        <button
          id="console-toggle"
          aria-label="Console"
          title="Console"
          disabled={!consoleAvailable}
          aria-expanded={consoleOpen}
          aria-controls="graph-console"
          onClick={() => activate(onConsole)}
        >
          <Icon name="workbench" size={18} />
        </button>
        <button
          id="settings-btn"
          aria-label="Settings"
          title="Settings"
          aria-expanded={settingsOpen}
          aria-controls="settings-modal"
          onClick={() => activate(onSettings)}
        >
          <Icon name="sliders" size={18} />
        </button>
      </div>
    </div>
  );
}
