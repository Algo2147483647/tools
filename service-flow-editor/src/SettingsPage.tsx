import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

export type SettingsSection = 'canvas' | 'nodes' | 'typography';
const sections = [
  { id: 'canvas', label: 'Canvas', icon: 'grid', detail: 'Theme & grid' },
  { id: 'nodes', label: 'Nodes', icon: 'node', detail: 'Shape & appearance' },
  { id: 'typography', label: 'Typography', icon: 'type', detail: 'Fonts & labels' },
  { id: 'gestures', label: 'Gestures', icon: 'cursor', detail: 'Pan, zoom & select' },
] as const;

const gestureGroups = [
  {
    title: 'Mouse & keyboard',
    icon: 'cursor',
    items: [
      ['Select an area', 'Drag empty canvas'],
      ['Add to selection', 'Shift + click or drag'],
      ['Pan the canvas', 'Space + drag · middle / right drag'],
      ['Zoom at pointer', 'Ctrl / ⌘ + scroll'],
      ['Expand a service', 'Double-click a node'],
      ['Open actions', 'Right-click'],
    ],
  },
  {
    title: 'Trackpad',
    icon: 'fit',
    items: [
      ['Pan the canvas', 'Scroll with two fingers'],
      ['Zoom at pointer', 'Pinch in or out'],
    ],
  },
  {
    title: 'Touchscreen',
    icon: 'node',
    items: [
      ['Pan or move a node', 'Drag with one finger'],
      ['Pan & zoom together', 'Drag and pinch with two fingers'],
      ['Select / expand', 'Tap / double-tap a node'],
      ['Open actions', 'Touch and hold'],
    ],
  },
];

export default function SettingsPage({
  children,
  onClose,
  status,
  saveState,
  onRetry,
  workspaceName,
}: {
  children: (section: SettingsSection) => ReactNode;
  onClose: () => void;
  status: string;
  saveState: string;
  onRetry: () => void;
  workspaceName?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const doneButton = useRef<HTMLButtonElement>(null);
  const [tab, setTab] = useState<SettingsSection | 'gestures'>('canvas');
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    element?.showModal();
    return () => {
      element?.close();
      previousFocus?.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-page"
      aria-labelledby="settings-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        if (event.shiftKey && event.target === closeButton.current) {
          event.preventDefault();
          doneButton.current?.focus();
        } else if (!event.shiftKey && event.target === doneButton.current) {
          event.preventDefault();
          closeButton.current?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header className="settings-header">
        <div className="settings-heading">
          <span className="settings-mark">
            <Icon name="settings" size={22} />
          </span>
          <div>
            <h2 id="settings-title">Settings</h2>
            <p>Customize your canvas, nodes and text.</p>
          </div>
        </div>
        <button ref={closeButton} className="icon-button" aria-label="Close settings" onClick={onClose}>
          <Icon name="close" size={20} />
        </button>
      </header>
      <div className="settings-layout">
        <aside className="settings-sidebar">
          <span className="settings-nav-label">PREFERENCES</span>
          <nav aria-label="Settings sections">
            {sections.map((section) => (
              <button
                key={section.id}
                className={tab === section.id ? 'active' : ''}
                aria-label={section.label}
                aria-current={tab === section.id ? 'page' : undefined}
                aria-controls="settings-content"
                onClick={() => setTab(section.id)}
              >
                <Icon name={section.icon} size={19} />
                <span>
                  <strong>{section.label}</strong>
                  <small>{section.detail}</small>
                </span>
                <Icon name="chevron" size={13} />
              </button>
            ))}
          </nav>
          <div className="settings-scope">
            <Icon name="layers" size={18} />
            <strong title={workspaceName}>{workspaceName || 'No workspace open'}</strong>
            <p>
              {workspaceName
                ? 'Canvas, node and text settings apply across every graph in this workspace.'
                : 'Open a workspace to customize your graphs.'}
            </p>
          </div>
        </aside>
        <div className="settings-scroll" id="settings-content" key={tab}>
          {tab !== 'gestures' ? (
            children(tab)
          ) : (
            <section className="gesture-guide" aria-label="Gestures">
              <div className="settings-section-heading">
                <span className="settings-kicker">MAKE YOURSELF AT HOME</span>
                <h3>Gestures & shortcuts</h3>
                <p>A quick guide to finding your way around the canvas.</p>
              </div>
              {gestureGroups.map((group) => (
                <section className="settings-group gesture-group" key={group.title}>
                  <div className="settings-group-heading">
                    <Icon name={group.icon} />
                    <h4>{group.title}</h4>
                  </div>
                  <dl>
                    {group.items.map(([action, shortcut]) => (
                      <div key={action}>
                        <dt>{action}</dt>
                        <dd>{shortcut}</dd>
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </section>
          )}
        </div>
      </div>
      <footer className="settings-footer">
        <div className={`settings-save-state ${saveState}`} role="status">
          <Icon name={saveState === 'error' ? 'warning' : 'check'} size={15} />
          <span>{status}</span>
          {saveState === 'error' && (
            <button className="text-button" onClick={onRetry}>
              Retry save
            </button>
          )}
        </div>
        <div className="settings-footer-actions">
          <span>
            <kbd>Esc</kbd> to close
          </span>
          <button ref={doneButton} className="primary" onClick={onClose}>
            Done
            <Icon name="check" size={15} />
          </button>
        </div>
      </footer>
    </dialog>
  );
}
