import { useEffect, useRef, useState, type ReactNode } from 'react';
import Icon from './Icon';

type Section = 'canvas' | 'nodes' | 'typography';
export default function SettingsPage({
  children,
  onClose,
}: {
  children: (section: Section) => ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [tab, setTab] = useState<Section | 'gestures'>('canvas');
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="settings-page"
      aria-label="Settings"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <span className="eyebrow">WORKSPACE PREFERENCES</span>
          <h2>Settings</h2>
        </div>
        <button className="icon-button" aria-label="Close settings" onClick={onClose}>
          <Icon name="close" />
        </button>
      </header>
      <div className="settings-layout">
        <nav aria-label="Settings sections">
          <button className={tab === 'canvas' ? 'active' : ''} onClick={() => setTab('canvas')}>
            <Icon name="grid" />
            Canvas
          </button>
          <button className={tab === 'nodes' ? 'active' : ''} onClick={() => setTab('nodes')}>
            <Icon name="node" />
            Nodes
          </button>
          <button className={tab === 'typography' ? 'active' : ''} onClick={() => setTab('typography')}>
            <Icon name="type" />
            Typography
          </button>
          <button className={tab === 'gestures' ? 'active' : ''} onClick={() => setTab('gestures')}>
            <Icon name="cursor" />
            Gestures
          </button>
        </nav>
        <div className="settings-scroll" key={tab}>
          {tab !== 'gestures' ? (
            children(tab)
          ) : (
            <section className="gesture-guide">
              <h3>Gestures</h3>
              <dl>
                <dt>Trackpad</dt>
                <dd>Scroll with two fingers to pan. Pinch to zoom around the pointer.</dd>
                <dt>Touchscreen</dt>
                <dd>
                  Drag empty space with one finger to pan. Drag a node to move it. Use two fingers to pan and
                  pinch together. Tap to select; double-tap a node to expand. Hold to open the context menu.
                </dd>
                <dt>Mouse and keyboard</dt>
                <dd>
                  Left-drag empty space to select. Shift-click adds to the selection. Right-drag, middle-drag,
                  or Space-drag pans. Ctrl/Cmd + wheel zooms. Use the toolbar to fit or zoom the graph.
                </dd>
              </dl>
            </section>
          )}
        </div>
      </div>
    </dialog>
  );
}
