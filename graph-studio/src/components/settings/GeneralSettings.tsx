import type { ChangeEvent, MouseEvent } from "react";
import type { ImportFileButtonState } from "../../hooks/useGraphImport";
import { DIRECTORY_INPUT_PROPS } from "./settingsConfig";

interface GeneralSettingsProps {
  status: string;
  fileName: string;
  importFileButtonState: ImportFileButtonState;
  relativeLinkRootName: string;
  hasGraph: boolean;
  consoleSidebarOpen: boolean;
  onClose: () => void;
  onConsoleSidebarToggle: () => void;
  onFileInputClick: (event: MouseEvent<HTMLInputElement>) => void;
  onFileInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onFolderInputClick: (event: MouseEvent<HTMLInputElement>) => void;
  onFolderInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onRelativeLinkRootSelect: () => void;
  onInitializeCanvas: () => void;
  onExport: () => void;
  onFieldMappingOpen: () => void;
}

export default function GeneralSettings({
  status,
  fileName,
  importFileButtonState,
  relativeLinkRootName,
  hasGraph,
  consoleSidebarOpen,
  onClose,
  onConsoleSidebarToggle,
  onFileInputClick,
  onFileInputChange,
  onFolderInputClick,
  onFolderInputChange,
  onRelativeLinkRootSelect,
  onInitializeCanvas,
  onExport,
  onFieldMappingOpen,
}: GeneralSettingsProps) {
  const importFileClassName = [
    "ghost-btn",
    "settings-action-btn",
    "file-input-label",
    importFileButtonState.status === "success" ? "file-input-label-success" : "",
    importFileButtonState.status === "error" ? "file-input-label-error" : "",
  ].filter(Boolean).join(" ");
  const importFileTitle = importFileButtonState.status === "success"
    ? `Current file: ${importFileButtonState.fileName || fileName}`
    : importFileButtonState.status === "error"
      ? "Import error"
      : fileName ? `Current file: ${fileName}` : "Import JSON file";

  return (
    <>
      <section className="settings-section" aria-labelledby="file-actions-title">
        <p id="file-actions-title" className="control-label">Files</p>
        <div className="import-action-row">
          <label htmlFor="fileInput" className={importFileClassName} title={importFileTitle}>
            <span className="file-input-text">{importFileButtonState.label}</span>
            <input type="file" id="fileInput" accept=".json,application/json" multiple onClick={onFileInputClick} onChange={onFileInputChange} />
          </label>
          <label htmlFor="folderInput" className="ghost-btn settings-action-btn file-input-label folder-input-label" title="Import JSON files from a folder">
            <span className="file-input-text">Import Folder</span>
            <input
              type="file"
              id="folderInput"
              accept=".json,application/json"
              multiple
              onClick={onFolderInputClick}
              onChange={onFolderInputChange}
              {...DIRECTORY_INPUT_PROPS}
            />
          </label>
          <button
            id="relative-link-root-btn"
            className="ghost-btn settings-action-btn"
            type="button"
            title={relativeLinkRootName ? `Current resolve path: ${relativeLinkRootName}` : "Choose a base path for relative links"}
            onClick={onRelativeLinkRootSelect}
          >
            Resolve Path
          </button>
          <button id="export-btn" className="ghost-btn settings-action-btn" type="button" disabled={!hasGraph} onClick={onExport}>Export SVG</button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="data-actions-title">
        <p id="data-actions-title" className="control-label">Graph Data</p>
        <div className="workspace-action-row">
          <button
            id="field-mapping-btn"
            className="ghost-btn settings-action-btn"
            type="button"
            onClick={() => {
              onClose();
              onFieldMappingOpen();
            }}
          >
            Field Mapping
          </button>
          <button type="button" className="ghost-btn settings-action-btn" onClick={onInitializeCanvas}>Initialize</button>
        </div>
      </section>

      <section className="settings-section" aria-labelledby="general-workspace-title">
        <p id="general-workspace-title" className="control-label">Workspace</p>
        <div className="workspace-action-row">
          <button
            id="console-sidebar-toggle-btn"
            className={`ghost-btn settings-action-btn${consoleSidebarOpen ? " settings-action-btn-active" : ""}`}
            type="button"
            aria-pressed={consoleSidebarOpen}
            onClick={onConsoleSidebarToggle}
          >
            {consoleSidebarOpen ? "Hide Console" : "Show Console"}
          </button>
        </div>
      </section>

      <p id="graph-summary" className="graph-summary">{status}</p>
    </>
  );
}
