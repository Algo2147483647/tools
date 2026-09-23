import { useEffect, useRef, useState, type ReactNode, type Ref } from 'react';
import Icon from './Icon';
import type { View } from './Canvas';

type Props = {
  toolbarRef: Ref<HTMLElement>;
  workspaceName?: string;
  crumbs: { id: string; title: string }[];
  navigate: (id: string) => void;
  sidebarOpen: boolean;
  inspectorOpen: boolean;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  status: ReactNode;
  canUndo: boolean;
  canRedo: boolean;
  canConnect: boolean;
  undo: () => void;
  redo: () => void;
  addNode: () => void;
  addFlow: () => void;
  autoLayout: () => void;
  layoutBusy: boolean;
  maxDepth: number;
  expand: (depth: number) => void;
  validation: boolean;
  validate: () => void;
  tracing: boolean;
  canTrace: boolean;
  trace: () => void;
  presentation: boolean;
  present: () => void;
  view: View;
  setView: (view: View) => void;
  fit: () => void;
  settings: () => void;
  openFolder: () => void;
};

export default function Toolbar(p: Props) {
  const [menu, setMenu] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) return;
    popup.current?.querySelector<HTMLElement>('select,button:not(:disabled)')?.focus();
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setMenu(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenu(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [menu]);
  const command = (run: () => void) => {
    setMenu(false);
    run();
  };
  const zoom = (factor: number) =>
    p.setView({ ...p.view, scale: Math.max(0.2, Math.min(2.5, p.view.scale * factor)) });
  return (
    <header className="topbar" ref={p.toolbarRef}>
      <button
        className="icon-button panel-toggle sidebar-toggle"
        aria-label={p.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        title={p.sidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
        aria-expanded={p.sidebarOpen}
        aria-controls="workspace-sidebar"
        onClick={p.toggleSidebar}
      >
        <Icon name="panel-left" size={19} />
      </button>
      <div className="breadcrumbs">
        <span className="workspace-label" title={p.workspaceName}>
          {p.workspaceName || 'Service Atlas'}
        </span>
        {p.crumbs.map((crumb, i) => (
          <span key={crumb.id} className="crumb">
            <Icon name="chevron" size={12} />
            <button
              title={crumb.title}
              disabled={i === p.crumbs.length - 1}
              onClick={() => p.navigate(crumb.id)}
            >
              {crumb.title}
            </button>
          </span>
        ))}
      </div>
      {p.crumbs.length > 1 && (
        <button
          className="icon-button"
          aria-label="Up one level"
          title="Up one level"
          onClick={() => p.navigate(p.crumbs.at(-2)!.id)}
        >
          <Icon name="back" size={16} />
        </button>
      )}
      {p.status}
      {p.workspaceName && (
        <>
          <div className="heading-actions" role="group" aria-label="Edit graph">
            <button
              className="icon-button toolbar-secondary-action"
              aria-label="Undo"
              title="Undo (Ctrl/Cmd+Z)"
              disabled={!p.canUndo}
              onClick={p.undo}
            >
              <Icon name="undo" size={17} />
            </button>
            <button
              className="icon-button toolbar-secondary-action"
              aria-label="Redo"
              title="Redo (Ctrl/Cmd+Shift+Z)"
              disabled={!p.canRedo}
              onClick={p.redo}
            >
              <Icon name="redo" size={17} />
            </button>
            <button
              className="icon-button toolbar-secondary-action"
              aria-label="Add flow"
              title="Add flow"
              disabled={!p.canConnect}
              onClick={p.addFlow}
            >
              <Icon name="link" size={17} />
            </button>
            <button
              className="primary toolbar-add"
              aria-label="Add service"
              title="Add service (N)"
              onClick={p.addNode}
            >
              <Icon name="plus" size={17} />
              <span>Add service</span>
            </button>
          </div>
          <button
            className="secondary toolbar-layout"
            aria-label="Auto layout"
            title="Auto layout current graph and its subgraphs"
            disabled={!p.canConnect || p.layoutBusy}
            onClick={p.autoLayout}
          >
            <Icon name="layout" size={18} />
            <span>{p.layoutBusy ? 'Arranging…' : 'Auto layout'}</span>
          </button>
          <div className="toolbar-menu" ref={root}>
            <button
              ref={trigger}
              className="secondary toolbar-view"
              aria-label="View options"
              title="View and graph tools"
              aria-expanded={menu}
              aria-haspopup="dialog"
              onClick={() => setMenu((v) => !v)}
            >
              <Icon name="layers" size={17} />
              <span>View</span>
              <Icon name="chevron" size={11} />
            </button>
            {menu && (
              <div
                className="toolbar-popover"
                ref={popup}
                role="dialog"
                aria-label="View options"
                data-canvas-control
                onKeyDown={(event) => {
                  event.stopPropagation();
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    setMenu(false);
                    trigger.current?.focus();
                  }
                }}
              >
                <div className="command-section">
                  <span className="command-heading">Subgraphs</span>
                  <label className="field">
                    Expand levels
                    <select
                      aria-label="Expand levels"
                      value=""
                      onChange={(event) => {
                        const depth = event.target.value === 'all' ? Infinity : Number(event.target.value);
                        command(() => p.expand(depth));
                      }}
                    >
                      <option value="" disabled>
                        Choose depth
                      </option>
                      <option value="0">Collapse all</option>
                      {Array.from({ length: p.maxDepth }, (_, i) => (
                        <option key={i} value={i + 1}>
                          Expand {i + 1} {i ? 'levels' : 'level'}
                        </option>
                      ))}
                      <option value="all">Expand all levels</option>
                    </select>
                  </label>
                </div>
                <div className="command-section">
                  <span className="command-heading">Analyze</span>
                  <button aria-pressed={p.validation} onClick={() => command(p.validate)}>
                    <Icon name="check" />
                    Validate<span className="command-state">{p.validation ? 'On' : ''}</span>
                  </button>
                  <button
                    aria-label="Highlight chain"
                    aria-pressed={p.tracing}
                    disabled={!p.canTrace}
                    onClick={() => command(p.trace)}
                  >
                    <Icon name="branch" />
                    Highlight chain<span className="command-state">{p.tracing ? 'On' : ''}</span>
                  </button>
                </div>
                <div className="command-section compact-commands">
                  <span className="command-heading">Edit</span>
                  <button disabled={!p.canUndo} onClick={() => command(p.undo)}>
                    <Icon name="undo" />
                    Undo<kbd>⌘ / Ctrl Z</kbd>
                  </button>
                  <button disabled={!p.canRedo} onClick={() => command(p.redo)}>
                    <Icon name="redo" />
                    Redo<kbd>⇧ ⌘ / Ctrl Z</kbd>
                  </button>
                  <button disabled={!p.canConnect} onClick={() => command(p.addFlow)}>
                    <Icon name="link" />
                    Add flow
                  </button>
                </div>
                <div className="command-section compact-commands">
                  <span className="command-heading">Zoom</span>
                  <div className="menu-zoom">
                    <button aria-label="Zoom out" onClick={() => zoom(1 / 1.15)}>
                      <Icon name="minus" />
                    </button>
                    <span>{Math.round(p.view.scale * 100)}%</span>
                    <button aria-label="Zoom in" onClick={() => zoom(1.15)}>
                      <Icon name="plus" />
                    </button>
                    <button onClick={() => command(p.fit)}>
                      <Icon name="fit" />
                      Fit graph
                    </button>
                  </div>
                </div>
                <div className="command-section">
                  <span className="command-heading">Workspace</span>
                  <button disabled={p.presentation} onClick={() => command(p.openFolder)}>
                    <Icon name="folder" />
                    Open folder
                  </button>
                </div>
              </div>
            )}
          </div>
          <button
            className={`secondary toolbar-present ${p.presentation ? 'presentation-active' : ''}`}
            aria-label={p.presentation ? 'Exit & restore' : 'Present'}
            aria-pressed={p.presentation}
            title={p.presentation ? 'Exit & restore' : 'Presentation mode'}
            onClick={p.present}
          >
            <Icon name="present" size={18} />
            <span>{p.presentation ? 'Exit & restore' : 'Present'}</span>
          </button>
          <div className="zoom-controls" role="group" aria-label="Canvas zoom">
            <button
              className="icon-button"
              aria-label="Zoom out"
              title="Zoom out"
              onClick={() => zoom(1 / 1.15)}
            >
              <Icon name="minus" size={15} />
            </button>
            <span>{Math.round(p.view.scale * 100)}%</span>
            <button className="icon-button" aria-label="Zoom in" title="Zoom in" onClick={() => zoom(1.15)}>
              <Icon name="plus" size={15} />
            </button>
            <button className="icon-button" aria-label="Fit graph" title="Fit graph (1)" onClick={p.fit}>
              <Icon name="fit" size={17} />
            </button>
          </div>
        </>
      )}
      <button
        className="icon-button settings-trigger"
        aria-label="Settings"
        title="Settings"
        onClick={p.settings}
      >
        <Icon name="settings" size={18} />
      </button>
      <button
        className="icon-button top-open"
        aria-label="Open folder"
        title="Open folder"
        disabled={p.presentation}
        onClick={p.openFolder}
      >
        <Icon name="folder" size={18} />
      </button>
      {p.workspaceName && (
        <button
          className="icon-button panel-toggle inspector-toggle"
          aria-label={p.inspectorOpen ? 'Collapse inspector' : 'Expand inspector'}
          title={p.inspectorOpen ? 'Collapse inspector' : 'Expand inspector'}
          aria-expanded={p.inspectorOpen}
          aria-controls="workspace-inspector"
          onClick={p.toggleInspector}
        >
          <Icon name="panel-right" size={19} />
        </button>
      )}
    </header>
  );
}
