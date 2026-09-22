import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useWorkspace } from './useWorkspace';
import {
  removeNode,
  renameNode,
  validateKey,
  type FlowEdge,
  type ServiceNode,
  type Side,
  type Workspace,
  type Point,
} from './model';
import { addBend, reconnectEdge, routeEdge } from './routing';
import Canvas, { type CanvasContext, type Selection, type View } from './Canvas';
import DocumentEditor from './DocumentEditor';
import Icon from './Icon';
import ThemePicker from './ThemePicker';
import ContextMenu, { type ContextAction } from './ContextMenu';

const uid = () => crypto.randomUUID();
const defaultView = { x: 60, y: 60, scale: 1 };
const sides: Side[] = ['right', 'bottom', 'left', 'top'];
function downloadJSON(value: Workspace, name = 'workspace-recovery.json') {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function readRecent(): string[] {
  try {
    return JSON.parse(localStorage.getItem('service-atlas-recent') || '[]');
  } catch {
    return [];
  }
}

function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal ${wide ? 'wide' : ''}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2>{title}</h2>
        <button className="icon-button" aria-label="Close dialog" onClick={onClose}>
          <Icon name="close" />
        </button>
      </div>
      {children}
    </dialog>
  );
}

function WorkspaceDialog({
  initialMode,
  onClose,
  onOpen,
}: {
  initialMode: 'open' | 'create';
  onClose: () => void;
  onOpen: (path: string, create: boolean, name: string) => Promise<void>;
}) {
  const [mode, setMode] = useState(initialMode),
    [path, setPath] = useState(''),
    [name, setName] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await onOpen(path, mode === 'create', name);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  async function browse() {
    setBusy(true);
    setError('');
    try {
      const response = await fetch('/api/workspace/pick', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ create: mode === 'create' }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || 'Folder picker unavailable. Enter a folder path below.');
      if (result.path) setPath(result.path);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title="Your architecture, in one folder."
      onClose={() => {
        if (!busy) onClose();
      }}
    >
      <p className="modal-intro">A local workspace keeps every service, flow, and document together.</p>
      <div className="tab-bar">
        <button className={mode === 'open' ? 'active' : ''} onClick={() => setMode('open')} disabled={busy}>
          Open workspace
        </button>
        <button
          className={mode === 'create' ? 'active' : ''}
          onClick={() => setMode('create')}
          disabled={busy}
        >
          Create workspace
        </button>
      </div>
      <form onSubmit={submit}>
        {mode === 'create' && (
          <label className="field">
            Workspace name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Commerce platform"
              autoFocus
            />
          </label>
        )}
        <label className="field">
          Workspace folder
          <div className="input-with-button">
            <input
              required
              autoFocus={mode === 'open'}
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="C:\Projects\commerce-platform"
            />
            <button type="button" className="secondary" onClick={() => void browse()} disabled={busy}>
              <Icon name="folder" />
              Browse
            </button>
          </div>
        </label>
        <p className="field-help">
          {mode === 'create'
            ? 'Choose an existing folder or enter a new folder path. A workspace.json file will be created here.'
            : 'Select the folder containing workspace.json. All nested graphs and saved layouts will reopen.'}
        </p>
        {mode === 'open' && readRecent().length > 0 && (
          <div className="recent-list">
            <span className="eyebrow">RECENT FOLDERS</span>
            {readRecent()
              .slice(0, 3)
              .map((item) => (
                <button type="button" key={item} onClick={() => setPath(item)}>
                  <Icon name="folder" size={15} />
                  <span>{item}</span>
                </button>
              ))}
          </div>
        )}
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="primary" disabled={busy || !path.trim()}>
            {busy ? 'Working…' : mode === 'create' ? 'Create workspace' : 'Open workspace'}
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function NodeDialog({
  workspace,
  onClose,
  onCreate,
}: {
  workspace: Workspace;
  onClose: () => void;
  onCreate: (key: string) => Promise<void>;
}) {
  let suggestion = 1;
  while (workspace.nodes.some((n) => n.key.toLowerCase() === `service-${suggestion}`)) suggestion++;
  const [key, setKey] = useState(`service-${suggestion}`),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="Add a service" onClose={onClose}>
      <p className="modal-intro">
        Give this service a unique name. Its Markdown document and internal graph are created automatically.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const issue = validateKey(key, workspace.nodes);
          if (issue) {
            setError(issue);
            return;
          }
          setBusy(true);
          try {
            await onCreate(key);
          } catch (err) {
            setError(String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Service key
          <input
            autoFocus
            required
            value={key}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              setKey(e.target.value);
              setError('');
            }}
          />
        </label>
        <div className="file-preview">
          <Icon name="file" size={18} />
          <span>{key || 'service'}.md</span>
          <span>Auto-linked document</span>
        </div>
        {error && (
          <div className="inline-error" role="alert">
            {error}
          </div>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={busy}>
            Create service
            <Icon name="plus" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function FlowDialog({
  nodes,
  onClose,
  onCreate,
}: {
  nodes: ServiceNode[];
  onClose: () => void;
  onCreate: (source: string, target: string, weights: string[]) => void;
}) {
  const [source, setSource] = useState(nodes[0]?.key || ''),
    [target, setTarget] = useState(nodes[1]?.key || nodes[0]?.key || ''),
    [weights, setWeights] = useState('');
  return (
    <Modal title="Connect your services" onClose={onClose}>
      <p className="modal-intro">
        Define the direction of a data flow. Add interface names, events, or data types as weights.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onCreate(source, target, weights ? weights.split('\n') : []);
        }}
      >
        <label className="field">
          Source service
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id}>{n.key}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Destination service
          <select value={target} onChange={(e) => setTarget(e.target.value)}>
            {nodes.map((n) => (
              <option key={n.id}>{n.key}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Weights <span className="optional">one per line</span>
          <textarea
            value={weights}
            onChange={(e) => setWeights(e.target.value)}
            placeholder={'POST /orders\nOrderCreated\napplication/json'}
            rows={4}
          />
        </label>
        <div className="modal-actions">
          <button className="secondary" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" disabled={!source || !target}>
            Create flow
            <Icon name="arrow" size={16} />
          </button>
        </div>
      </form>
    </Modal>
  );
}

function KeyField({
  node,
  nodes,
  onRename,
}: {
  node: ServiceNode;
  nodes: ServiceNode[];
  onRename: (value: string) => Promise<void>;
}) {
  const [value, setValue] = useState(node.key),
    [error, setError] = useState('');
  useEffect(() => {
    setValue(node.key);
    setError('');
  }, [node.key, node.id]);
  async function commit() {
    if (value === node.key) return;
    const issue = validateKey(value, nodes, node.id);
    if (issue) {
      setError(issue);
      return;
    }
    try {
      await onRename(value);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }
  return (
    <>
      <label className="field">
        Service key
        <input
          aria-label="Service key"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError('');
          }}
          onBlur={() => void commit()}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur();
          }}
        />
      </label>
      {error && (
        <div className="inline-error" role="alert">
          {error}
        </div>
      )}
      <p className="field-help">Unique across all levels. Renaming also renames the Markdown file.</p>
    </>
  );
}

function NumberField({
  label,
  value,
  min,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  onChange: (n: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <label className="number-field">
      <span>{label}</span>
      <input
        aria-label={label}
        type="number"
        min={min}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (e.target.value && Number.isFinite(n) && (min === undefined || n >= min)) onChange(n);
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

function WeightsField({ edge, onChange }: { edge: FlowEdge; onChange: (weights: string[]) => void }) {
  return (
    <label className="field">
      Weights <span className="optional">string array</span>
      <textarea
        aria-label="Flow weights"
        rows={5}
        value={edge.weights.join('\n')}
        placeholder={'GET /inventory\nStockUpdated'}
        onChange={(e) => onChange(e.target.value ? e.target.value.split('\n') : [])}
      />
      <span className="field-help">One interface, event, or data type per line.</span>
    </label>
  );
}

export default function App() {
  const store = useWorkspace();
  const workspace = store.workspace;
  const [graphId, setGraphId] = useState('root'),
    [selection, setSelection] = useState<Selection>(null);
  const [view, setView] = useState<View>(defaultView),
    [modal, setModal] = useState<'open' | 'create' | 'node' | 'flow' | 'delete' | 'help' | null>(null);
  const [contextMenu, setContextMenu] = useState<CanvasContext | null>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      const stored = localStorage.getItem('service-atlas-sidebar-collapsed');
      return stored === null ? window.innerWidth <= 760 : stored === 'true';
    } catch {
      return window.innerWidth <= 760;
    }
  });
  const newNodePosition = useRef<Point | null>(null);
  const [search, setSearch] = useState(''),
    [notice, setNotice] = useState(''),
    [inspectorTab, setInspectorTab] = useState('properties');
  const [segmentIndex, setSegmentIndex] = useState(1);
  const [inspectorOpen, setInspectorOpen] = useState(() => window.innerWidth >= 950);
  const [documentState, setDocumentState] = useState({ status: 'saved', error: '' });
  const onDocumentStatus = useCallback(
    (status: string, error: string) => setDocumentState({ status, error }),
    [],
  );
  const docFlush = useRef<() => Promise<void>>(async () => {});
  const docRetry = useRef<() => Promise<void>>(async () => {});
  const views = useRef<Record<string, View>>({});
  const localNodes = workspace?.nodes.filter((n) => n.graphId === graphId) || [];
  const localEdges = workspace?.edges.filter((e) => e.graphId === graphId) || [];
  const selectedNode =
    selection?.type === 'node' ? workspace?.nodes.find((n) => n.id === selection.id) : undefined;
  const storedEdge =
    selection?.type === 'edge' ? workspace?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedEdge =
    storedEdge && workspace
      ? storedEdge.points.length
        ? storedEdge
        : {
            ...storedEdge,
            points: routeEdge(
              workspace.nodes.find((n) => n.key === storedEdge.source)!,
              workspace.nodes.find((n) => n.key === storedEdge.target)!,
              storedEdge.sourceSide,
              storedEdge.targetSide,
            ),
          }
      : undefined;
  const graph = workspace?.graphs.find((g) => g.id === graphId);
  const parent = workspace?.nodes.find((n) => n.id === graph?.parentNodeId);
  const crumbs: { id: string; title: string }[] = [];
  if (workspace) {
    let cursor = graph;
    while (cursor?.parentNodeId) {
      const owner = workspace.nodes.find((n) => n.id === cursor!.parentNodeId);
      if (!owner) break;
      crumbs.unshift({ id: cursor.id, title: owner.key });
      cursor = workspace.graphs.find((g) => g.id === owner.graphId);
    }
    crumbs.unshift({ id: workspace.rootGraphId, title: 'Overview' });
  }
  async function action(fn: () => void | Promise<void>) {
    try {
      await docFlush.current();
      await fn();
      setNotice('');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  }
  function changeNode(id: string, patch: Partial<ServiceNode>) {
    store.change((w) => {
      const nodes = w.nodes.map((n) => (n.id === id ? { ...n, ...patch } : n));
      const changed = nodes.find((n) => n.id === id)!;
      return {
        ...w,
        nodes,
        edges: w.edges.map((e) =>
          e.source === changed.key || e.target === changed.key
            ? {
                ...e,
                points: reconnectEdge(
                  e,
                  nodes.find((n) => n.key === e.source)!,
                  nodes.find((n) => n.key === e.target)!,
                ),
              }
            : e,
        ),
      };
    });
  }
  function changeEdge(id: string, patch: Partial<FlowEdge>) {
    store.change((w) => ({ ...w, edges: w.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
  }
  function navigate(id: string) {
    void action(() => {
      views.current[graphId] = view;
      setGraphId(id);
      setView(views.current[id] || defaultView);
      setSelection(null);
      setContextMenu(null);
      setSearch('');
    });
  }
  function select(next: Selection) {
    if (next?.type === selection?.type && next?.id === selection?.id) return;
    void action(() => {
      setSelection(next);
      setInspectorTab('properties');
      setSegmentIndex(1);
    });
  }
  function fit() {
    if (!localNodes.length) {
      setView(defaultView);
      return;
    }
    const bounds = document.querySelector('.canvas-wrap')?.getBoundingClientRect();
    if (!bounds) return;
    const left = Math.min(...localNodes.map((n) => n.x)),
      top = Math.min(...localNodes.map((n) => n.y));
    const right = Math.max(...localNodes.map((n) => n.x + n.width)),
      bottom = Math.max(...localNodes.map((n) => n.y + n.height));
    const scale = Math.min(
      1.4,
      Math.max(0.2, Math.min((bounds.width - 140) / (right - left), (bounds.height - 160) / (bottom - top))),
    );
    setView({
      scale,
      x: (bounds.width - (right - left) * scale) / 2 - left * scale,
      y: (bounds.height - (bottom - top) * scale) / 2 - top * scale,
    });
  }
  function addFlow(
    sourceKey: string,
    targetKey: string,
    weights: string[] = [],
    sourceSide: Side = 'right',
    targetSide: Side = 'left',
  ) {
    const source = localNodes.find((n) => n.key === sourceKey)!,
      target = localNodes.find((n) => n.key === targetKey)!;
    const id = uid();
    const edge: FlowEdge = {
      id,
      graphId,
      source: sourceKey,
      target: targetKey,
      weights,
      sourceSide,
      targetSide,
      points: routeEdge(source, target, sourceSide, targetSide),
    };
    store.change((w) => ({ ...w, edges: [...w.edges, edge] }));
    setModal(null);
    select({ type: 'edge', id });
  }
  async function openWorkspace(path: string, create: boolean, name: string) {
    await docFlush.current();
    await store.open(path, create, name || undefined);
    views.current = {};
    setGraphId('');
    setView(defaultView);
    setSelection(null);
    setModal(null);
    setContextMenu(null);
    setSearch('');
    try {
      localStorage.setItem(
        'service-atlas-recent',
        JSON.stringify([path, ...readRecent().filter((p) => p !== path)].slice(0, 8)),
      );
    } catch {
      /* Disk persistence is independent of recent folders. */
    }
  }
  useEffect(() => {
    if (workspace && !workspace.graphs.some((g) => g.id === graphId)) setGraphId(workspace.rootGraphId);
  }, [workspace, graphId]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 950px)');
    const resize = () => setInspectorOpen(media.matches);
    media.addEventListener('change', resize);
    return () => media.removeEventListener('change', resize);
  }, []);
  useEffect(() => {
    function keyboard(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void action(async () => store.flush());
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable], [data-theme-control], [role="menu"]',
        ) ||
        modal
      )
        return;
      if (e.key === 'Escape') {
        setContextMenu(null);
        select(null);
      }
      if (!workspace) return;
      if (e.key.toLowerCase() === 'n') openNewNode();
      if (e.key === '/') {
        e.preventDefault();
        setSidebarCollapsed(false);
        requestAnimationFrame(() =>
          document.querySelector<HTMLInputElement>('[aria-label="Search services"]')?.focus(),
        );
      }
      if (e.key === '?') setModal('help');
      if (e.key === '1') fit();
      if ((e.key === 'Delete' || e.key === 'Backspace') && selection) {
        e.preventDefault();
        setModal('delete');
      }
      if (e.key === 'Enter' && selectedNode) navigate(selectedNode.childGraphId);
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        localStorage.setItem('service-atlas-sidebar-collapsed', String(next));
      } catch {
        /* Keep the current view when browser storage is unavailable. */
      }
      return next;
    });
  }
  function openNewNode(position?: Point) {
    newNodePosition.current = position ? { x: Math.round(position.x), y: Math.round(position.y) } : null;
    setModal('node');
  }
  function inspect(target: NonNullable<Selection>, document = false) {
    void action(() => {
      setSelection(target);
      setInspectorOpen(true);
      setInspectorTab(document ? 'document' : 'properties');
      setSegmentIndex(1);
    });
  }
  const contextNode =
    contextMenu?.target?.type === 'node'
      ? workspace?.nodes.find((n) => n.id === contextMenu.target!.id)
      : undefined;
  const contextEdge =
    contextMenu?.target?.type === 'edge'
      ? workspace?.edges.find((e) => e.id === contextMenu.target!.id)
      : undefined;
  const contextActions: ContextAction[] = contextNode
    ? [
        {
          label: 'Service properties',
          icon: 'node',
          run: () => inspect({ type: 'node', id: contextNode.id }),
        },
        {
          label: 'Open document',
          icon: 'file',
          run: () => inspect({ type: 'node', id: contextNode.id }, true),
        },
        { label: 'Explore inside', icon: 'layers', run: () => navigate(contextNode.childGraphId) },
        {
          label: 'Delete service',
          icon: 'trash',
          danger: true,
          run: () =>
            void action(() => {
              setSelection({ type: 'node', id: contextNode.id });
              setModal('delete');
            }),
        },
      ]
    : contextEdge
      ? [
          { label: 'Edit flow', icon: 'link', run: () => inspect({ type: 'edge', id: contextEdge.id }) },
          {
            label: 'Reverse direction',
            icon: 'refresh',
            run: () =>
              changeEdge(contextEdge.id, {
                source: contextEdge.target,
                target: contextEdge.source,
                sourceSide: contextEdge.targetSide,
                targetSide: contextEdge.sourceSide,
                points: [...contextEdge.points].reverse(),
              }),
          },
          {
            label: 'Reset path',
            icon: 'branch',
            run: () =>
              changeEdge(contextEdge.id, {
                points: routeEdge(
                  localNodes.find((n) => n.key === contextEdge.source)!,
                  localNodes.find((n) => n.key === contextEdge.target)!,
                  contextEdge.sourceSide,
                  contextEdge.targetSide,
                ),
              }),
          },
          {
            label: 'Delete flow',
            icon: 'trash',
            danger: true,
            run: () =>
              void action(() => {
                setSelection({ type: 'edge', id: contextEdge.id });
                setModal('delete');
              }),
          },
        ]
      : [
          { label: 'Add service here', icon: 'plus', run: () => openNewNode(contextMenu!.point) },
          { label: 'Add flow', icon: 'link', disabled: !localNodes.length, run: () => setModal('flow') },
          { label: 'Fit graph', icon: 'fit', run: fit },
          { label: 'Reset view', icon: 'refresh', run: () => setView(defaultView) },
          ...(parent ? [{ label: 'Up one level', icon: 'back', run: () => navigate(parent.graphId) }] : []),
        ];
  const documentStatus = selectedNode ? documentState.status : 'saved';
  const overallStatus =
    store.status === 'error' || documentStatus === 'error'
      ? 'error'
      : store.status === 'saving' || documentStatus === 'saving'
        ? 'saving'
        : store.status === 'pending' || documentStatus === 'pending'
          ? 'pending'
          : store.status;
  const saveError = store.error || (selectedNode ? documentState.error : '');
  const retrySave = () => {
    setNotice('');
    store.retry();
    void docRetry.current().catch((err) => setNotice(err instanceof Error ? err.message : String(err)));
  };
  const displayStatus = {
    idle: 'Local workspace',
    saved: 'All changes saved',
    pending: 'Unsaved changes',
    saving: 'Saving changes…',
    error: 'Save failed',
  }[overallStatus];
  const searchResults =
    workspace?.nodes.filter((n) =>
      search ? n.key.toLowerCase().includes(search.toLowerCase()) : n.graphId === graphId,
    ) || [];
  return (
    <div className="app-shell">
      <aside
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
        aria-hidden={sidebarCollapsed}
        inert={sidebarCollapsed}
      >
        <div className="brand">
          <span className="brand-mark">
            <Icon name="atlas" size={24} />
          </span>
          <div>
            Service Atlas<span>RELATIONSHIPS, REVEALED.</span>
          </div>
          <button
            className="dark-icon-button sidebar-close"
            aria-label="Collapse sidebar"
            onClick={toggleSidebar}
          >
            <Icon name="sidebar" size={17} />
          </button>
        </div>
        <div className="workspace-card">
          <div className="eyebrow">WORKSPACE</div>
          <button className="workspace-switch" onClick={() => setModal('open')}>
            <span className="workspace-initial">{workspace?.name[0]?.toUpperCase() || 'S'}</span>
            <span>
              <strong>{workspace?.name || 'Your next system'}</strong>
              <small>
                {workspace
                  ? `${workspace.nodes.length} services across ${workspace.graphs.length} graphs`
                  : 'Open a folder to begin'}
              </small>
            </span>
            <Icon name="chevron" size={14} />
          </button>
          {workspace && (
            <p className="workspace-path" title={store.path}>
              {store.path}
            </p>
          )}
        </div>
        <div className="sidebar-nav">
          <button
            className={!parent ? 'active' : ''}
            onClick={() => workspace && navigate(workspace.rootGraphId)}
          >
            <Icon name="grid" />
            Architecture overview
            <span>{workspace?.nodes.filter((n) => n.graphId === workspace.rootGraphId).length || '—'}</span>
          </button>
          <button onClick={() => setModal('create')}>
            <Icon name="folder" />
            New workspace
            <Icon name="plus" size={14} />
          </button>
        </div>
        <div className="sidebar-section-heading">
          <span className="eyebrow">{search ? 'SEARCH ALL LEVELS' : 'SERVICES IN THIS GRAPH'}</span>
          <button
            className="dark-icon-button"
            aria-label="Add service to current graph"
            onClick={() => (workspace ? openNewNode() : setModal('create'))}
          >
            <Icon name="plus" size={16} />
          </button>
        </div>
        <label className="search-box">
          <Icon name="search" size={15} />
          <input
            aria-label="Search services"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Find a service…"
          />
          <kbd>/</kbd>
        </label>
        <div className="service-list">
          {searchResults.map((n) => (
            <button
              key={n.id}
              className={selection?.type === 'node' && selection.id === n.id ? 'selected' : ''}
              onClick={() => {
                if (n.graphId !== graphId) {
                  void action(() => {
                    views.current[graphId] = view;
                    setGraphId(n.graphId);
                    setView(views.current[n.graphId] || defaultView);
                    setSelection({ type: 'node', id: n.id });
                    setSearch('');
                  });
                } else select({ type: 'node', id: n.id });
              }}
            >
              <span className="service-dot" />
              <span title={n.key}>
                {n.key}
                <small>
                  {search && n.graphId !== graphId
                    ? 'In a nested graph'
                    : `${workspace!.nodes.filter((child) => child.graphId === n.childGraphId).length} internal services`}
                </small>
              </span>
              <Icon name="chevron" size={12} />
            </button>
          ))}
          {!searchResults.length && (
            <p className="sidebar-empty">
              {search ? 'No matching services.' : 'Your services will appear here.'}
            </p>
          )}
        </div>
        <div className="sidebar-footer">
          <div className="local-note">
            <span className="live-dot" />
            LOCAL BY DESIGN<span>JSON + Markdown. Always yours.</span>
          </div>
          <button onClick={() => setModal('help')}>
            <Icon name="help" size={16} />
            Editor guide<kbd>?</kbd>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <button
            className="icon-button sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            onClick={toggleSidebar}
          >
            <Icon name="sidebar" size={18} />
          </button>
          <div className="breadcrumbs">
            <span className="workspace-label">{workspace ? workspace.name : 'Your workspace'}</span>
            {crumbs.map((c, i) => (
              <span key={c.id} className="crumb">
                <Icon name="chevron" size={12} />
                <button disabled={i === crumbs.length - 1} title={c.title} onClick={() => navigate(c.id)}>
                  {c.title}
                </button>
              </span>
            ))}
          </div>
          <div
            className={`save-status ${overallStatus}`}
            title={store.savedAt ? `Saved at ${new Date(store.savedAt).toLocaleTimeString()}` : undefined}
          >
            <span className="status-dot" />
            {displayStatus}
            {overallStatus === 'error' && <button onClick={retrySave}>Retry</button>}
          </div>
          {workspace && (
            <>
              <div className="heading-actions">
                {parent && (
                  <button className="secondary" onClick={() => navigate(parent.graphId)}>
                    <Icon name="back" size={16} />
                    Up one level
                  </button>
                )}
                <button className="secondary" disabled={!localNodes.length} onClick={() => setModal('flow')}>
                  <Icon name="link" size={16} />
                  Add flow
                </button>
                <button className="primary" onClick={() => openNewNode()}>
                  <Icon name="plus" size={17} />
                  Add service
                </button>
              </div>
              <div className="zoom-controls">
                <button
                  className="icon-button"
                  aria-label="Zoom out"
                  onClick={() => setView((v) => ({ ...v, scale: Math.max(0.2, v.scale / 1.15) }))}
                >
                  <Icon name="minus" size={15} />
                </button>
                <span>{Math.round(view.scale * 100)}%</span>
                <button
                  className="icon-button"
                  aria-label="Zoom in"
                  onClick={() => setView((v) => ({ ...v, scale: Math.min(2.5, v.scale * 1.15) }))}
                >
                  <Icon name="plus" size={15} />
                </button>
                <button className="icon-button" aria-label="Fit graph" title="Fit graph (1)" onClick={fit}>
                  <Icon name="fit" size={17} />
                </button>
                <button
                  className="icon-button"
                  aria-label="Toggle inspector"
                  aria-pressed={inspectorOpen}
                  title="Show or hide details"
                  onClick={() => setInspectorOpen((v) => !v)}
                >
                  <Icon name="node" size={16} />
                </button>
              </div>
            </>
          )}
          <ThemePicker />
          <button className="top-open secondary" onClick={() => setModal('open')}>
            <Icon name="folder" size={16} />
            Open folder
          </button>
        </header>
        {(saveError || notice || store.recoveryMessage) && (
          <div className={`notice-bar ${saveError || notice ? 'error' : ''}`} role="alert">
            <Icon name={saveError || notice ? 'warning' : 'refresh'} size={17} />
            <span>{saveError || notice || store.recoveryMessage}</span>
            {saveError && (
              <>
                <button onClick={retrySave}>Retry save</button>
                {workspace && <button onClick={() => downloadJSON(workspace)}>Download current JSON</button>}
              </>
            )}
            {!saveError && store.recoveryDraft && (
              <button onClick={() => downloadJSON(store.recoveryDraft!)}>Download recovery JSON</button>
            )}
            {!saveError && (
              <button
                aria-label="Dismiss notice"
                onClick={() => {
                  setNotice('');
                  store.discardRecoveryDraft();
                }}
              >
                <Icon name="close" size={14} />
              </button>
            )}
          </div>
        )}
        {!workspace ? (
          <section className="welcome">
            <div className="welcome-copy">
              <span className="eyebrow">THE BIG PICTURE. EVERY SMALL DETAIL.</span>
              <h1>
                Make sense of
                <br />
                your services<span>.</span>
              </h1>
              <p>
                Map relationships. Follow the data.
                <br />
                Explore the architecture inside every service.
              </p>
              <div className="welcome-actions">
                <button className="primary" onClick={() => setModal('create')}>
                  <Icon name="plus" />
                  Create workspace
                </button>
                <button className="secondary" onClick={() => setModal('open')}>
                  <Icon name="folder" />
                  Open workspace
                </button>
              </div>
              <div className="welcome-note">
                <span className="live-dot" />
                Stored in your folder. Ready when you are.
              </div>
            </div>
            <div className="welcome-diagram">
              <div className="diagram-label">
                <span className="live-dot" />A CONNECTED PERSPECTIVE
              </div>
              <svg viewBox="0 0 650 390" aria-label="Example service architecture">
                <defs>
                  <marker
                    id="welcome-arrow"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="6"
                    markerHeight="6"
                    orient="auto"
                  >
                    <path d="m2 1 6 4-6 4" fill="none" stroke="var(--edge-color)" strokeWidth="1.5" />
                  </marker>
                </defs>
                <path
                  d="M195 180H248Q260 180 260 168V107Q260 95 272 95H320 M195 180H248Q260 180 260 192V274Q260 286 272 286H320"
                  fill="none"
                  stroke="var(--edge-color)"
                  strokeWidth="2"
                  markerEnd="url(#welcome-arrow)"
                />
                <g transform="translate(30 125)">
                  <rect width="165" height="110" rx="12" fill="var(--surface)" stroke="var(--node-border)" />
                  <text x="20" y="30" className="diagram-type">
                    ENTRY POINT
                  </text>
                  <text x="20" y="60" className="diagram-name">
                    API Gateway
                  </text>
                  <text x="20" y="89" className="diagram-sub">
                    The way in
                  </text>
                </g>
                <g transform="translate(320 40)">
                  <rect
                    width="265"
                    height="140"
                    rx="12"
                    fill="var(--surface-subtle)"
                    stroke="var(--accent)"
                  />
                  <text x="20" y="30" className="diagram-type">
                    SERVICE / EXPLORE INSIDE
                  </text>
                  <text x="20" y="59" className="diagram-name">
                    Order Service
                  </text>
                  <rect
                    x="20"
                    y="78"
                    width="100"
                    height="39"
                    rx="6"
                    fill="var(--surface)"
                    stroke="var(--border)"
                  />
                  <text x="34" y="102" className="diagram-sub">
                    Validation
                  </text>
                  <path d="M120 98h23" stroke="var(--edge-color)" markerEnd="url(#welcome-arrow)" />
                  <rect
                    x="146"
                    y="78"
                    width="99"
                    height="39"
                    rx="6"
                    fill="var(--surface)"
                    stroke="var(--border)"
                  />
                  <text x="161" y="102" className="diagram-sub">
                    Processing
                  </text>
                </g>
                <g transform="translate(320 235)">
                  <rect width="215" height="105" rx="12" fill="var(--surface)" stroke="var(--node-border)" />
                  <text x="20" y="30" className="diagram-type">
                    SERVICE
                  </text>
                  <text x="20" y="61" className="diagram-name">
                    Identity Service
                  </text>
                  <text x="20" y="85" className="diagram-sub">
                    Clear connections, at every level
                  </text>
                </g>
                <text x="205" y="82" className="diagram-sub">
                  OrderCreated
                </text>
                <text x="202" y="309" className="diagram-sub">
                  Authorize
                </text>
              </svg>
              <div className="diagram-footer">
                <span>01 / CONNECT</span>
                <span>02 / UNDERSTAND</span>
                <span>03 / EXPLORE</span>
              </div>
            </div>
            <div className="welcome-features">
              <div>
                <Icon name="link" />
                <strong>Follow every flow</strong>
                <p>Directional connections with editable paths and meaningful weights.</p>
              </div>
              <div>
                <Icon name="layers" />
                <strong>Go a level deeper</strong>
                <p>Nested service graphs without a fixed depth limit.</p>
              </div>
              <div>
                <Icon name="file" />
                <strong>Keep context close</strong>
                <p>A Markdown document for every service, automatically linked.</p>
              </div>
            </div>
          </section>
        ) : (
          <>
            <div className="editor-layout">
              <section className="graph-area">
                <Canvas
                  workspace={workspace}
                  graphId={graphId}
                  selection={selection}
                  view={view}
                  onView={setView}
                  onSelect={select}
                  onEnter={(n) => navigate(n.childGraphId)}
                  onNode={changeNode}
                  onEdge={changeEdge}
                  onConnect={(source, target, sourceSide, targetSide) =>
                    addFlow(source.key, target.key, [], sourceSide, targetSide)
                  }
                  onContextMenu={setContextMenu}
                  onAdd={() => openNewNode()}
                />
              </section>
              <aside className={`inspector ${inspectorOpen ? '' : 'collapsed'}`}>
                <div className="inspector-title">
                  <Icon name={selectedEdge ? 'link' : selectedNode ? 'node' : 'layers'} size={17} />
                  <strong>
                    {selectedEdge ? 'Flow details' : selectedNode ? 'Service details' : 'Graph details'}
                  </strong>
                  {selection && (
                    <button className="icon-button" aria-label="Clear selection" onClick={() => select(null)}>
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
                {selectedNode ? (
                  <>
                    <div className="tab-bar inspector-tabs">
                      <button
                        className={inspectorTab === 'properties' ? 'active' : ''}
                        onClick={() => setInspectorTab('properties')}
                      >
                        Properties
                      </button>
                      <button
                        className={inspectorTab === 'document' ? 'active' : ''}
                        onClick={() => setInspectorTab('document')}
                      >
                        Document
                        <Icon name="file" size={13} />
                      </button>
                    </div>
                    <div className="inspector-body" hidden={inspectorTab !== 'properties'}>
                      <span className="tag">SERVICE NODE</span>
                      <KeyField
                        node={selectedNode}
                        nodes={workspace.nodes}
                        onRename={async (key) => {
                          await docFlush.current();
                          store.change((w) => renameNode(w, selectedNode.id, key));
                        }}
                      />
                      <div className="section-label">POSITION & SIZE</div>
                      <div className="geometry-fields">
                        <NumberField
                          label="X"
                          value={selectedNode.x}
                          onChange={(x) => changeNode(selectedNode.id, { x })}
                        />
                        <NumberField
                          label="Y"
                          value={selectedNode.y}
                          onChange={(y) => changeNode(selectedNode.id, { y })}
                        />
                        <NumberField
                          label="Width"
                          value={selectedNode.width}
                          min={160}
                          onChange={(width) => changeNode(selectedNode.id, { width })}
                        />
                        <NumberField
                          label="Height"
                          value={selectedNode.height}
                          min={64}
                          onChange={(height) => changeNode(selectedNode.id, { height })}
                        />
                      </div>
                      <div className="section-label">INTERNAL STRUCTURE</div>
                      <button className="explore-button" onClick={() => navigate(selectedNode.childGraphId)}>
                        <span>
                          <Icon name="layers" size={20} />
                          <strong>
                            Explore inside
                            <small>
                              {workspace.nodes.filter((n) => n.graphId === selectedNode.childGraphId).length}{' '}
                              internal services
                            </small>
                          </strong>
                        </span>
                        <Icon name="arrow" size={18} />
                      </button>
                      <p className="field-help">
                        Every service can hold its own graph. Double-click a node to go inside.
                      </p>
                      <div className="section-label">SERVICE DOCUMENT</div>
                      <button className="document-link" onClick={() => setInspectorTab('document')}>
                        <Icon name="file" size={17} />
                        <span>{selectedNode.key}.md</span>
                        <Icon name="chevron" size={13} />
                      </button>
                      <button className="danger-link" onClick={() => setModal('delete')}>
                        <Icon name="trash" size={16} />
                        Delete service
                      </button>
                    </div>
                    <div className="inspector-body document-body" hidden={inspectorTab !== 'document'}>
                      <DocumentEditor
                        key={`${store.path}:${selectedNode.id}`}
                        nodeKey={selectedNode.key}
                        nodeId={selectedNode.id}
                        workspacePath={store.path}
                        onStatus={onDocumentStatus}
                        token={store.token}
                        flushGraph={store.flush}
                        flushRef={docFlush}
                        retryRef={docRetry}
                      />
                    </div>
                  </>
                ) : selectedEdge ? (
                  <div className="inspector-body">
                    <span className="tag">DIRECTED DATA FLOW</span>
                    <div className="flow-summary">
                      <span>{selectedEdge.source}</span>
                      <Icon name="arrow" size={16} />
                      <span>{selectedEdge.target}</span>
                    </div>
                    <div className="two-fields">
                      {(['sourceSide', 'targetSide'] as const).map((side, i) => (
                        <label className="field" key={side}>
                          {i === 0 ? 'Source port' : 'Target port'}
                          <select
                            value={selectedEdge[side]}
                            onChange={(e) => {
                              const next = { ...selectedEdge, [side]: e.target.value as Side };
                              changeEdge(next.id, {
                                [side]: next[side],
                                points: routeEdge(
                                  localNodes.find((n) => n.key === next.source)!,
                                  localNodes.find((n) => n.key === next.target)!,
                                  next.sourceSide,
                                  next.targetSide,
                                ),
                              });
                            }}
                          >
                            {sides.map((s) => (
                              <option key={s} value={s}>
                                {s[0].toUpperCase() + s.slice(1)}
                              </option>
                            ))}
                          </select>
                        </label>
                      ))}
                    </div>
                    <WeightsField
                      edge={selectedEdge}
                      onChange={(weights) => changeEdge(selectedEdge.id, { weights })}
                    />
                    <div className="section-label">ORTHOGONAL PATH</div>
                    <p className="field-help">
                      Drag a square handle on the canvas to move a segment. Add a bend for more routing
                      control.
                    </p>
                    <label className="field">
                      Path segment
                      <select
                        aria-label="Path segment"
                        value={Math.min(segmentIndex, selectedEdge.points.length - 2)}
                        onChange={(e) => setSegmentIndex(Number(e.target.value))}
                      >
                        {selectedEdge.points.slice(0, -1).map((p, i) => (
                          <option key={i} value={i}>
                            Segment {i + 1} ·{' '}
                            {p.y === selectedEdge.points[i + 1].y ? 'Horizontal' : 'Vertical'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="two-fields">
                      <button
                        className="secondary"
                        onClick={() =>
                          changeEdge(selectedEdge.id, {
                            points: addBend(
                              selectedEdge.points,
                              Math.min(segmentIndex, selectedEdge.points.length - 2),
                            ),
                          })
                        }
                      >
                        <Icon name="plus" size={14} />
                        Add bend
                      </button>
                      <button
                        className="secondary"
                        onClick={() =>
                          changeEdge(selectedEdge.id, {
                            points: routeEdge(
                              localNodes.find((n) => n.key === selectedEdge.source)!,
                              localNodes.find((n) => n.key === selectedEdge.target)!,
                              selectedEdge.sourceSide,
                              selectedEdge.targetSide,
                            ),
                          })
                        }
                      >
                        <Icon name="refresh" size={14} />
                        Reset path
                      </button>
                    </div>
                    <details className="path-details">
                      <summary>{selectedEdge.points.length} saved path points</summary>
                      <div className="point-list">
                        {selectedEdge.points.map((p, i) => (
                          <div key={i}>
                            <span>{String(i + 1).padStart(2, '0')}</span>
                            <code>
                              {Math.round(p.x * 100) / 100}, {Math.round(p.y * 100) / 100}
                            </code>
                          </div>
                        ))}
                      </div>
                    </details>
                    <button
                      className="secondary full-width"
                      onClick={() => {
                        changeEdge(selectedEdge.id, {
                          source: selectedEdge.target,
                          target: selectedEdge.source,
                          sourceSide: selectedEdge.targetSide,
                          targetSide: selectedEdge.sourceSide,
                          points: [...selectedEdge.points].reverse(),
                        });
                      }}
                    >
                      <Icon name="refresh" size={15} />
                      Reverse direction
                    </button>
                    <button className="danger-link" onClick={() => setModal('delete')}>
                      <Icon name="trash" size={16} />
                      Delete flow
                    </button>
                  </div>
                ) : (
                  <div className="inspector-body">
                    <div className="graph-details-icon">
                      <Icon name="layers" size={28} />
                    </div>
                    <h3>{parent?.key || workspace.name}</h3>
                    <p className="field-help">
                      {parent
                        ? 'The internal architecture of this service.'
                        : 'A connected view of your system.'}{' '}
                      Select a service or flow to inspect its details.
                    </p>
                    <div className="graph-stats">
                      <div>
                        <strong>{localNodes.length}</strong>
                        <span>Services</span>
                      </div>
                      <div>
                        <strong>{localEdges.length}</strong>
                        <span>Data flows</span>
                      </div>
                    </div>
                    <div className="section-label">WORKSPACE AT A GLANCE</div>
                    <dl className="summary-list">
                      <dt>Total services</dt>
                      <dd>{workspace.nodes.length}</dd>
                      <dt>Total data flows</dt>
                      <dd>{workspace.edges.length}</dd>
                      <dt>Current depth</dt>
                      <dd>{crumbs.length - 1}</dd>
                      <dt>Revision</dt>
                      <dd>{workspace.revision}</dd>
                      <dt>Main file</dt>
                      <dd>workspace.json</dd>
                    </dl>
                    <div className="inspector-tip">
                      <Icon name="branch" size={20} />
                      <strong>There is more beneath the surface.</strong>
                      <p>
                        Double-click any service to map the components inside it. Follow the breadcrumbs to
                        find your way back.
                      </p>
                    </div>
                    <button
                      className="secondary full-width"
                      onClick={() => downloadJSON(workspace, 'workspace.json')}
                    >
                      <Icon name="download" size={15} />
                      Download graph JSON
                    </button>
                  </div>
                )}
              </aside>
            </div>
          </>
        )}
        <footer className="statusbar">
          <span>
            <span className="live-dot" />
            LOCAL WORKSPACE
          </span>
          <span>
            {workspace
              ? `workspace.json · ${workspace.nodes.length} services · ${workspace.edges.length} flows`
              : 'Built for a clearer view of your architecture'}
          </span>
          <span>SERVICE ATLAS / 1.0</span>
        </footer>
      </main>
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
      {(modal === 'open' || modal === 'create') && (
        <WorkspaceDialog initialMode={modal} onClose={() => setModal(null)} onOpen={openWorkspace} />
      )}
      {modal === 'node' && workspace && (
        <NodeDialog
          workspace={workspace}
          onClose={() => setModal(null)}
          onCreate={async (key) => {
            await docFlush.current();
            const id = uid(),
              childGraphId = uid();
            const index = localNodes.length;
            store.change((w) => ({
              ...w,
              nodes: [
                ...w.nodes,
                {
                  id,
                  key,
                  graphId,
                  childGraphId,
                  x: newNodePosition.current?.x ?? 40 + (index % 3) * 300,
                  y: newNodePosition.current?.y ?? 60 + Math.floor(index / 3) * 220,
                  width: 224,
                  height: 88,
                },
              ],
              graphs: [...w.graphs, { id: childGraphId, parentNodeId: id }],
            }));
            setSelection({ type: 'node', id });
            setInspectorTab('properties');
            setModal(null);
          }}
        />
      )}
      {modal === 'flow' && (
        <FlowDialog nodes={localNodes} onClose={() => setModal(null)} onCreate={addFlow} />
      )}
      {modal === 'delete' && workspace && selection && (
        <Modal
          title={selectedNode ? 'Delete this service?' : 'Delete this flow?'}
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            {selectedNode
              ? `Deleting “${selectedNode.key}” also deletes its nested services, connected flows, and all corresponding Markdown files. This cannot be undone.`
              : 'This data flow and its saved path will be removed.'}
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() =>
                void action(() => {
                  if (selectedNode) store.change((w) => removeNode(w, selectedNode.id));
                  else if (selectedEdge)
                    store.change((w) => ({ ...w, edges: w.edges.filter((e) => e.id !== selectedEdge.id) }));
                  setSelection(null);
                  setModal(null);
                })
              }
            >
              <Icon name="trash" size={16} />
              {selectedNode ? 'Delete service and documents' : 'Delete flow'}
            </button>
          </div>
        </Modal>
      )}
      {modal === 'help' && (
        <Modal title="A field guide to Service Atlas" wide onClose={() => setModal(null)}>
          <div className="guide">
            <p>
              Open or create a workspace folder. The main <code>workspace.json</code> stores every graph,
              node, connection, and path. Each service has a matching Markdown file in the same folder.
            </p>
            <div>
              <Icon name="node" />
              <section>
                <h3>Shape your architecture</h3>
                <p>
                  Add a service with <kbd>N</kbd>. Drag it to move; drag its bottom-right handle to resize.
                  Select it to edit its key, size, or Markdown document.
                </p>
              </section>
            </div>
            <div>
              <Icon name="link" />
              <section>
                <h3>Make the connections</h3>
                <p>
                  Drag a white anchor from one service onto another service or anchor. The left anchor shows
                  incoming flows; the right shows outgoing flows. Select a flow to edit weights, change ports,
                  add bends, or drag segment handles. Connections stay orthogonal as services move.
                </p>
              </section>
            </div>
            <div>
              <Icon name="layers" />
              <section>
                <h3>Explore every level</h3>
                <p>
                  Double-click a service or press <kbd>Enter</kbd> to go inside. Use the breadcrumb trail or
                  Up one level to return. Keys stay unique throughout the entire workspace.
                </p>
              </section>
            </div>
            <div>
              <Icon name="check" />
              <section>
                <h3>Keep your work</h3>
                <p>
                  Changes save automatically. <kbd>Ctrl S</kbd> saves immediately. If a save fails, keep this
                  tab open and use Retry save. Your current edits remain on the canvas; a recovery JSON can
                  also be downloaded.
                </p>
              </section>
            </div>
            <p className="field-help">
              Drag the empty canvas to pan. Scroll to zoom. Press <kbd>1</kbd> to fit the graph and{' '}
              <kbd>Esc</kbd> to cancel a connection. Right-click the canvas, a service, or a flow for
              contextual actions. The top-left button collapses the sidebar. Deleting a service also deletes
              its nested services and Markdown files.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
