import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import { useWorkspace } from './useWorkspace';
import {
  removeNode,
  renameNode,
  validateKey,
  canvasSettings,
  nodeAppearance,
  snapCoordinate,
  edgeGraphId,
  type NodeType,
  type FlowEdge,
  type ServiceNode,
  type Side,
  type Workspace,
  type Point,
} from './model';
import { addBend } from './routing';
import {
  scene,
  toggleExpanded,
  updateNodeGeometry,
  updateNodesGeometry,
  relayoutWorkspace,
  canonicalEdgePoints,
  rerouteEdges,
  nodeDegrees,
  type SceneNode,
} from './hierarchy';
import { expandToDepth, graphDepths, moveDestinations, moveToGraph, traceFlows } from './graphActions';
import SettingsPage from './SettingsPage';
import PresentationDocument from './PresentationDocument';
import { applyTheme, readTheme, saveTheme, type ThemeId } from './theme';
import Canvas, { type CanvasContext, type Selection, type SelectionItem, type View } from './Canvas';
import DocumentEditor from './DocumentEditor';
import Icon from './Icon';
import ThemePicker from './ThemePicker';
import ContextMenu, { type ContextAction } from './ContextMenu';
import CanvasSettings from './CanvasSettings';

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
      title="Workspace"
      onClose={() => {
        if (!busy) onClose();
      }}
    >
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
  onCreate: (key: string, type: NodeType) => Promise<void>;
}) {
  let suggestion = 1;
  while (workspace.nodes.some((n) => n.key.toLowerCase() === `service-${suggestion}`)) suggestion++;
  const [key, setKey] = useState(`service-${suggestion}`),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [type, setType] = useState<NodeType>('service');
  return (
    <Modal title="Add a service" onClose={onClose}>
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
            await onCreate(key, type);
          } catch (err) {
            setError(String(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Node type
          <select value={type} onChange={(event) => setType(event.target.value as NodeType)}>
            <option value="service">Service — rectangle</option>
            <option value="terminal">Source / sink — circle</option>
          </select>
        </label>
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
    <Modal title="Add flow" onClose={onClose}>
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
    </>
  );
}

function NumberField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min?: number;
  max?: number;
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
        max={max}
        value={text}
        onChange={(e) => {
          setText(e.target.value);
          const n = Number(e.target.value);
          if (
            e.target.value &&
            Number.isFinite(n) &&
            (min === undefined || n >= min) &&
            (max === undefined || n <= max)
          )
            onChange(n);
        }}
        onBlur={() => setText(String(value))}
      />
    </label>
  );
}

function WeightsField({ edge, onChange }: { edge: FlowEdge; onChange: (weights: string[]) => void }) {
  return (
    <label className="field">
      Weights <span className="optional">one per line</span>
      <textarea
        aria-label="Flow weights"
        rows={5}
        value={edge.weights.join('\n')}
        placeholder={'GET /inventory\nStockUpdated'}
        onChange={(e) => onChange(e.target.value ? e.target.value.split('\n') : [])}
      />
    </label>
  );
}

export default function App() {
  const store = useWorkspace();
  const workspace = store.workspace;
  const toolbar = useRef<HTMLElement>(null);
  const [toolbarHeight, setToolbarHeight] = useState(64);
  useLayoutEffect(() => {
    const observer = new ResizeObserver(() =>
      setToolbarHeight(toolbar.current?.getBoundingClientRect().height ?? 64),
    );
    if (toolbar.current) observer.observe(toolbar.current);
    return () => observer.disconnect();
  }, []);
  const [graphId, setGraphId] = useState('root');
  const [selections, setSelections] = useState<SelectionItem[]>([]);
  const selection: Selection = selections.length === 1 ? selections[0] : null;
  function setSelection(next: Selection) {
    setSelections(next ? [next] : []);
  }
  const [view, setView] = useState<View>(defaultView),
    [modal, setModal] = useState<
      'open' | 'create' | 'node' | 'flow' | 'delete' | 'help' | 'settings' | 'move' | null
    >(null);
  const [theme, setTheme] = useState<ThemeId>(readTheme);
  const [validation, setValidation] = useState(false);
  const [traceId, setTraceId] = useState<string | null>(null);
  const [moveNodeId, setMoveNodeId] = useState<string | null>(null);
  const [moveGraphId, setMoveGraphId] = useState('');
  const [presentationBusy, setPresentationBusy] = useState(false);
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
  const newNodeGraph = useRef<string | null>(null);
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
  const presentation = useRef<{
    workspace: Workspace;
    graphId: string;
    view: View;
    views: Record<string, View>;
    selections: SelectionItem[];
    sidebarCollapsed: boolean;
    inspectorOpen: boolean;
    inspectorTab: string;
    search: string;
    theme: ThemeId;
    validation: boolean;
    traceId: string | null;
    documents: Map<string, string>;
  } | null>(null);
  const trace = useMemo(
    () => (workspace && traceId ? traceFlows(workspace, traceId) : null),
    [workspace, traceId],
  );
  const invalidNodes = useMemo(
    () =>
      workspace && validation
        ? new Set([...nodeDegrees(workspace)].filter(([, degree]) => degree.incoming === 0).map(([id]) => id))
        : new Set<string>(),
    [workspace, validation],
  );
  const maxDepth = useMemo(() => {
    if (!workspace) return 1;
    const populated = new Set(workspace.nodes.map((node) => node.graphId));
    const depths = graphDepths(workspace, graphId);
    return Math.max(
      1,
      ...workspace.nodes
        .filter((node) => populated.has(node.childGraphId))
        .map((node) => depths.get(node.id) ?? 0),
    );
  }, [workspace, graphId]);
  const movingNode = workspace?.nodes.find((node) => node.id === moveNodeId);
  const destinations = workspace && movingNode ? moveDestinations(workspace, movingNode.id) : [];
  function changeTheme(next: ThemeId) {
    setTheme(next);
    if (store.presentation) applyTheme(next);
    else saveTheme(next);
  }
  async function togglePresentation() {
    setPresentationBusy(true);
    try {
      if (store.presentation && presentation.current) {
        const original = presentation.current;
        store.exitPresentation();
        setGraphId(original.graphId);
        setView(original.view);
        views.current = original.views;
        setSelections(original.selections);
        setSidebarCollapsed(original.sidebarCollapsed);
        setInspectorOpen(original.inspectorOpen);
        setInspectorTab(original.inspectorTab);
        setSearch(original.search);
        setTheme(original.theme);
        applyTheme(original.theme);
        setValidation(original.validation);
        setTraceId(original.traceId);
        presentation.current = null;
      } else {
        await docFlush.current();
        await store.flush();
        const original = store.enterPresentation();
        if (!original) return;
        presentation.current = {
          workspace: original,
          graphId,
          view,
          views: structuredClone(views.current),
          selections,
          sidebarCollapsed,
          inspectorOpen,
          inspectorTab,
          search,
          theme,
          validation,
          traceId,
          documents: new Map(),
        };
      }
      docFlush.current = async () => {};
      docRetry.current = async () => {};
      setDocumentState({ status: 'saved', error: '' });
      setNotice('');
      setContextMenu(null);
      setModal(null);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error));
    } finally {
      setPresentationBusy(false);
    }
  }
  const localNodes = workspace?.nodes.filter((n) => n.graphId === graphId) || [];
  const localEdges = workspace?.edges.filter((e) => e.graphId === graphId) || [];
  const visibleScene = useMemo(() => (workspace ? scene(workspace, graphId) : null), [workspace, graphId]);
  const visibleNodes = visibleScene?.nodes || [];
  const selectedNode =
    selection?.type === 'node' ? workspace?.nodes.find((n) => n.id === selection.id) : undefined;
  const storedEdge =
    selection?.type === 'edge' ? workspace?.edges.find((e) => e.id === selection.id) : undefined;
  const selectedEdge =
    storedEdge && workspace && !storedEdge.points.length
      ? rerouteEdges(workspace).edges.find((edge) => edge.id === storedEdge.id)
      : storedEdge;
  const selectedDisplayEdge = visibleScene?.edges.find((edge) => edge.id === selectedEdge?.id);
  const selectedDisplayNode = visibleNodes.find((node) => node.id === selectedNode?.id);
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
    store.change((w) => updateNodeGeometry(w, id, patch), {
      historyKey: `node:${id}:${Object.keys(patch).join(',')}`,
    });
  }
  function changeEdge(id: string, patch: Partial<FlowEdge>) {
    if (patch.points && !patch.routing) patch = { ...patch, routing: 'manual' };
    store.change(
      (w) => relayoutWorkspace({ ...w, edges: w.edges.map((e) => (e.id === id ? { ...e, ...patch } : e)) }),
      patch.weights ? { historyKey: `weights:${id}` } : undefined,
    );
  }
  function restoreHistory(direction: 'undo' | 'redo') {
    void action(() => {
      store.endHistoryGroup();
      store[direction]();
      setSelection(null);
      setContextMenu(null);
    });
  }
  function toggleNode(node: ServiceNode) {
    void action(() => {
      store.change((w) => toggleExpanded(w, node.id));
      setSelection({ type: 'node', id: node.id });
      setInspectorTab('properties');
    });
  }
  function navigate(id: string) {
    void action(() => {
      views.current[graphId] = view;
      setGraphId(id);
      setView(views.current[id] || initialView());
      setSelection(null);
      setContextMenu(null);
      setSearch('');
    });
  }
  function select(next: Selection) {
    if (selections.length <= 1 && next?.type === selection?.type && next?.id === selection?.id) return;
    void action(() => {
      setSelection(next);
      setInspectorTab('properties');
      setSegmentIndex(1);
    });
  }
  function selectMany(next: SelectionItem[]) {
    void action(() => {
      setSelections(next);
      setInspectorTab('properties');
      setSegmentIndex(1);
    });
  }
  function selectAll() {
    selectMany([
      ...visibleNodes.map((node): SelectionItem => ({ type: 'node', id: node.id })),
      ...(visibleScene?.edges || []).map((edge): SelectionItem => ({ type: 'edge', id: edge.id })),
    ]);
  }
  function fit() {
    fitNodes(visibleNodes);
  }
  function fitNodes(nodes: SceneNode[]) {
    if (!nodes.length) {
      setView(initialView());
      return;
    }
    const bounds = document.querySelector('.canvas-wrap')?.getBoundingClientRect();
    if (!bounds) return;
    const area = canvasArea();
    const left = Math.min(...nodes.map((n) => n.x)),
      top = Math.min(...nodes.map((n) => n.y));
    const right = Math.max(...nodes.map((n) => n.x + n.width)),
      bottom = Math.max(...nodes.map((n) => n.y + n.height));
    const scale = Math.min(
      1.4,
      Math.max(0.2, Math.min((area.width - 80) / (right - left), (area.height - 80) / (bottom - top))),
    );
    setView({
      scale,
      x: area.x + (area.width - (right - left) * scale) / 2 - left * scale,
      y: area.y + (area.height - (bottom - top) * scale) / 2 - top * scale,
    });
  }
  function canvasArea() {
    const left = sidebarCollapsed ? 16 : 284;
    const right = inspectorOpen ? 324 : 16;
    // On narrow screens panels are overlays; keep a useful canvas target between them when possible.
    const usableLeft = window.innerWidth - left - right >= 280 ? left : 16;
    const usableRight = window.innerWidth - usableLeft - right >= 280 ? right : 16;
    const top = toolbarHeight + 28;
    return {
      x: usableLeft,
      y: top,
      width: window.innerWidth - usableLeft - usableRight,
      height: Math.max(160, window.innerHeight - top - 48),
    };
  }
  function initialView(): View {
    const area = canvasArea();
    return { x: area.x + 20, y: area.y + 20, scale: 1 };
  }
  function addFlow(
    sourceKey: string,
    targetKey: string,
    weights: string[] = [],
    sourceSide: Side = 'right',
    targetSide: Side = 'left',
  ) {
    if (!workspace) return;
    const source = workspace.nodes.find((n) => n.key === sourceKey)!,
      target = workspace.nodes.find((n) => n.key === targetKey)!;
    const id = uid();
    const edge: FlowEdge = {
      id,
      graphId: edgeGraphId(workspace, source, target),
      source: sourceKey,
      target: targetKey,
      sourceNodeId: source.id,
      targetNodeId: target.id,
      weights,
      sourceSide,
      targetSide,
      points: [],
      routing: 'auto',
    };
    store.change((w) => relayoutWorkspace({ ...w, edges: [...w.edges, edge] }));
    setModal(null);
    select({ type: 'edge', id });
  }
  async function openWorkspace(path: string, create: boolean, name: string) {
    if (store.presentation) throw new Error('Exit presentation mode before changing workspaces.');
    await docFlush.current();
    await store.open(path, create, name || undefined);
    views.current = {};
    setGraphId('');
    setView(initialView());
    setSelection(null);
    setModal(null);
    setContextMenu(null);
    setSearch('');
    setValidation(false);
    setTraceId(null);
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
    if (!workspace) return;
    setSelections((items) => {
      const valid = items.filter((item) =>
        item.type === 'node'
          ? workspace.nodes.some((node) => node.id === item.id)
          : workspace.edges.some((edge) => edge.id === item.id),
      );
      return valid.length === items.length ? items : valid;
    });
  }, [workspace]);
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
          'input, textarea, select, [contenteditable], [data-theme-control], [data-canvas-control], [role="menu"]',
        ) ||
        modal ||
        presentationBusy
      )
        return;
      if (e.key === 'Escape') {
        setContextMenu(null);
        select(null);
      }
      if (!workspace) return;
      if ((e.ctrlKey || e.metaKey) && ['z', 'y'].includes(e.key.toLowerCase())) {
        e.preventDefault();
        restoreHistory(e.key.toLowerCase() === 'y' || e.shiftKey ? 'redo' : 'undo');
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        selectAll();
        return;
      }
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
      if ((e.key === 'Delete' || e.key === 'Backspace') && selections.length) {
        e.preventDefault();
        setModal('delete');
      }
      if (e.key === 'Enter' && selectedNode) toggleNode(selectedNode);
    }
    window.addEventListener('keydown', keyboard);
    return () => window.removeEventListener('keydown', keyboard);
  });
  function toggleSidebar() {
    setSidebarCollapsed((value) => {
      const next = !value;
      try {
        if (!store.presentation) localStorage.setItem('service-atlas-sidebar-collapsed', String(next));
      } catch {
        /* Keep the current view when browser storage is unavailable. */
      }
      return next;
    });
  }
  function openNewNode(position?: Point, targetGraphId = graphId) {
    newNodePosition.current = position ? { x: Math.round(position.x), y: Math.round(position.y) } : null;
    newNodeGraph.current = targetGraphId;
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
  const contextSelection =
    selections.length > 1 &&
    (!contextMenu?.target ||
      selections.some((item) => item.type === contextMenu.target?.type && item.id === contextMenu.target.id));
  const targetActions: ContextAction[] = contextSelection
    ? [
        ...(contextNode
          ? [
              {
                label: 'Focus subgraph',
                icon: 'layers' as const,
                run: () => navigate(contextNode.childGraphId),
              },
            ]
          : []),
        {
          label: `Delete ${selections.length} selected elements`,
          icon: 'trash',
          danger: true,
          run: () => setModal('delete'),
        },
        { label: 'Clear selection', icon: 'close', run: () => select(null) },
      ]
    : contextNode
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
          {
            label: contextNode.expanded ? 'Collapse subgraph' : 'Expand subgraph',
            icon: 'layers',
            run: () => toggleNode(contextNode),
          },
          {
            label: 'Add service inside',
            icon: 'plus',
            run: () => openNewNode(undefined, contextNode.childGraphId),
          },
          { label: 'Focus subgraph', icon: 'layers', run: () => navigate(contextNode.childGraphId) },
          {
            label: 'Highlight upstream and downstream',
            icon: 'branch',
            run: () => setTraceId(contextNode.id),
          },
          {
            label: 'Move to graph…',
            icon: 'folder',
            run: () => {
              setMoveNodeId(contextNode.id);
              setMoveGraphId(moveDestinations(workspace!, contextNode.id)[0]?.id ?? '');
              setModal('move');
            },
          },
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
                  sourceNodeId: contextEdge.targetNodeId,
                  targetNodeId: contextEdge.sourceNodeId,
                  sourceSide: contextEdge.targetSide,
                  targetSide: contextEdge.sourceSide,
                  points: [...contextEdge.points].reverse(),
                  routing: contextEdge.routing ?? 'manual',
                }),
            },
            {
              label: 'Reset path',
              icon: 'branch',
              run: () =>
                changeEdge(contextEdge.id, {
                  points: [],
                  routing: 'auto',
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
            {
              label: 'Add flow',
              icon: 'link',
              disabled: !workspace?.nodes.length,
              run: () => setModal('flow'),
            },
            { label: 'Fit graph', icon: 'fit', run: fit },
            { label: 'Reset view', icon: 'refresh', run: () => setView(initialView()) },
            ...(parent ? [{ label: 'Up one level', icon: 'back', run: () => navigate(parent.graphId) }] : []),
          ];
  const contextActions: ContextAction[] = [
    { label: 'Undo', icon: 'undo', disabled: !store.canUndo, run: () => restoreHistory('undo') },
    { label: 'Redo', icon: 'redo', disabled: !store.canRedo, run: () => restoreHistory('redo') },
    { label: 'Select all', icon: 'cursor', run: selectAll },
    ...targetActions,
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
  const displayStatus = store.presentation
    ? 'Presentation · changes are temporary'
    : {
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
    <div
      className={`app-shell ${workspace ? 'workspace-open' : ''} ${sidebarCollapsed ? 'sidebar-hidden' : ''}`}
      style={{ '--toolbar-height': `${toolbarHeight}px` } as CSSProperties}
      inert={presentationBusy}
    >
      <aside
        id="workspace-sidebar"
        className={`sidebar ${sidebarCollapsed ? 'collapsed' : ''}`}
        aria-hidden={sidebarCollapsed}
        inert={sidebarCollapsed}
      >
        <div className="brand">
          <span className="brand-mark">
            <Icon name="atlas" size={24} />
          </span>
          <div>Service Atlas</div>
        </div>
        <div className="workspace-card">
          <div className="eyebrow">WORKSPACE</div>
          <button className="workspace-switch" disabled={store.presentation} onClick={() => setModal('open')}>
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
          <button disabled={store.presentation} onClick={() => setModal('create')}>
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
              className={
                selections.some((item) => item.type === 'node' && item.id === n.id) ? 'selected' : ''
              }
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
            <p className="sidebar-empty">{search ? 'No matching services.' : 'No services.'}</p>
          )}
        </div>
        <div className="sidebar-footer">
          <button onClick={() => setModal('help')}>
            <Icon name="help" size={16} />
            Editor guide<kbd>?</kbd>
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar" ref={toolbar}>
          <button
            className="icon-button panel-toggle sidebar-toggle"
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-controls="workspace-sidebar"
            onClick={toggleSidebar}
          >
            <Icon name="panel-left" size={19} />
          </button>
          <div className="toolbar-content">
            <div className="toolbar-navigation">
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
              <div className="toolbar-utilities" role="group" aria-label="Workspace tools">
                <button
                  className="icon-button settings-trigger"
                  aria-label="Settings"
                  title="Settings"
                  onClick={() => setModal('settings')}
                >
                  <Icon name="settings" size={18} />
                </button>
                <button
                  className="icon-button top-open"
                  aria-label="Open folder"
                  title="Open folder"
                  disabled={store.presentation}
                  onClick={() => setModal('open')}
                >
                  <Icon name="folder" size={18} />
                </button>
              </div>
            </div>
            {workspace && (
              <div className="toolbar-actions">
                <div className="heading-actions" role="group" aria-label="Edit graph">
                  <button
                    className="icon-button"
                    aria-label="Undo"
                    title="Undo (Ctrl/Cmd+Z)"
                    disabled={!store.canUndo}
                    onClick={() => restoreHistory('undo')}
                  >
                    <Icon name="undo" size={17} />
                  </button>
                  <button
                    className="icon-button"
                    aria-label="Redo"
                    title="Redo (Ctrl/Cmd+Shift+Z)"
                    disabled={!store.canRedo}
                    onClick={() => restoreHistory('redo')}
                  >
                    <Icon name="redo" size={17} />
                  </button>
                  {parent && (
                    <button
                      className="icon-button"
                      aria-label="Up one level"
                      title="Up one level"
                      onClick={() => navigate(parent.graphId)}
                    >
                      <Icon name="back" size={16} />
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={!workspace.nodes.length}
                    onClick={() => setModal('flow')}
                  >
                    <Icon name="link" size={16} />
                    Add flow
                  </button>
                  <button className="primary" onClick={() => openNewNode()}>
                    <Icon name="plus" size={17} />
                    Add service
                  </button>
                </div>
                <div className="graph-tools" role="group" aria-label="Graph tools">
                  <select
                    aria-label="Expand levels"
                    value=""
                    onChange={(event) => {
                      const depth = event.target.value === 'all' ? Infinity : Number(event.target.value);
                      void action(() => {
                        const next = expandToDepth(workspace, graphId, depth);
                        store.change(() => next);
                        fitNodes(scene(next, graphId).nodes);
                      });
                    }}
                  >
                    <option value="" disabled>
                      Expand levels
                    </option>
                    <option value="0">Collapse all</option>
                    {Array.from({ length: maxDepth }, (_, index) => (
                      <option key={index} value={index + 1}>
                        Expand {index + 1} {index ? 'levels' : 'level'}
                      </option>
                    ))}
                    <option value="all">Expand all levels</option>
                  </select>
                  <button
                    className="secondary"
                    aria-pressed={validation}
                    onClick={() => setValidation((value) => !value)}
                    title="Find services with no incoming flows"
                  >
                    <Icon name="check" size={16} />
                    Validate
                  </button>
                  <button
                    className="secondary"
                    aria-label="Highlight chain"
                    aria-pressed={!!traceId}
                    disabled={!selectedNode && !traceId}
                    onClick={() => setTraceId(traceId ? null : selectedNode!.id)}
                    title="Highlight upstream and downstream"
                  >
                    <Icon name="branch" size={16} />
                  </button>
                  <button
                    className={`secondary ${store.presentation ? 'presentation-active' : ''}`}
                    aria-pressed={store.presentation}
                    onClick={() => void togglePresentation()}
                    title="Temporary editing; exit to restore the original workspace"
                  >
                    <Icon name="present" size={16} />
                    {store.presentation ? 'Exit & restore' : 'Present'}
                  </button>
                </div>
                <div className="zoom-controls" role="group" aria-label="Canvas zoom">
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
                </div>
              </div>
            )}
          </div>
          {workspace && (
            <button
              className="icon-button panel-toggle inspector-toggle"
              aria-label={inspectorOpen ? 'Collapse inspector' : 'Expand inspector'}
              title={inspectorOpen ? 'Collapse inspector' : 'Expand inspector'}
              aria-expanded={inspectorOpen}
              aria-controls="workspace-inspector"
              onClick={() => setInspectorOpen((v) => !v)}
            >
              <Icon name="panel-right" size={19} />
            </button>
          )}
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
              <h1>Service Atlas</h1>
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
            </div>
            <div className="welcome-diagram">
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
                    SERVICE
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
                </g>
                <text x="205" y="82" className="diagram-sub">
                  OrderCreated
                </text>
                <text x="202" y="309" className="diagram-sub">
                  Authorize
                </text>
              </svg>
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
                  selections={selections}
                  view={view}
                  onView={setView}
                  onSelect={select}
                  onSelectionChange={selectMany}
                  onNodes={(updates) => store.change((w) => updateNodesGeometry(w, updates))}
                  onGestureStart={store.beginHistoryGroup}
                  onGestureEnd={store.endHistoryGroup}
                  onEnter={toggleNode}
                  onAddInside={(node) => openNewNode(undefined, node.childGraphId)}
                  onNode={changeNode}
                  onEdge={changeEdge}
                  onConnect={(source, target, sourceSide, targetSide) =>
                    addFlow(source.key, target.key, [], sourceSide, targetSide)
                  }
                  onContextMenu={setContextMenu}
                  onAdd={() => openNewNode()}
                  invalidNodes={invalidNodes}
                  trace={trace}
                />
                {(validation || traceId) && (
                  <div className="analysis-panel" aria-label="Graph analysis">
                    {validation && (
                      <details open>
                        <summary>{invalidNodes.size} services without incoming flows</summary>
                        <p>Descendant inputs count toward ancestors. Parent inputs do not flow down.</p>
                        <div className="validation-results">
                          {workspace.nodes
                            .filter((node) => invalidNodes.has(node.id))
                            .map((node) => (
                              <button
                                key={node.id}
                                onClick={() => {
                                  void action(() => {
                                    setGraphId(node.graphId);
                                    setView(views.current[node.graphId] || initialView());
                                    setSelection({ type: 'node', id: node.id });
                                  });
                                }}
                              >
                                {node.key}
                                <span>No incoming flows</span>
                              </button>
                            ))}
                        </div>
                        <button className="text-button" onClick={() => setValidation(false)}>
                          Clear validation
                        </button>
                      </details>
                    )}
                    {traceId && (
                      <div className="trace-legend">
                        <span className="upstream">Upstream</span>
                        <span className="downstream">Downstream</span>
                        <span className="both">Both directions</span>
                        <button
                          aria-label="Clear chain highlight"
                          className="icon-button"
                          onClick={() => setTraceId(null)}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </section>
              <aside id="workspace-inspector" className={`inspector ${inspectorOpen ? '' : 'collapsed'}`}>
                <div className="inspector-title">
                  <Icon name={selectedEdge ? 'link' : selectedNode ? 'node' : 'layers'} size={17} />
                  <strong>
                    {selectedEdge ? 'Flow details' : selectedNode ? 'Service details' : 'Graph details'}
                  </strong>
                  {selections.length > 0 && (
                    <button className="icon-button" aria-label="Clear selection" onClick={() => select(null)}>
                      <Icon name="close" size={15} />
                    </button>
                  )}
                </div>
                {selections.length > 1 ? (
                  <div className="inspector-body">
                    <span className="tag">MULTIPLE SELECTION</span>
                    <h3>{selections.length} elements selected</h3>
                    <p className="field-help">
                      {selections.filter((item) => item.type === 'node').length} services ·{' '}
                      {selections.filter((item) => item.type === 'edge').length} flows
                    </p>
                    <button className="danger-link" onClick={() => setModal('delete')}>
                      <Icon name="trash" size={16} />
                      Delete selected elements
                    </button>
                    <button className="secondary full-width" onClick={() => select(null)}>
                      Clear selection
                    </button>
                  </div>
                ) : selectedNode ? (
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
                      <span className="tag">
                        {selectedNode.type === 'terminal' ? 'SOURCE / SINK' : 'SERVICE NODE'}
                      </span>
                      <label className="field">
                        Node type
                        <select
                          value={selectedNode.type ?? 'service'}
                          onChange={(event) =>
                            changeNode(selectedNode.id, { type: event.target.value as NodeType })
                          }
                        >
                          <option value="service">Service — rectangle</option>
                          <option value="terminal">Source / sink — circle</option>
                        </select>
                      </label>
                      <KeyField
                        node={selectedNode}
                        nodes={workspace.nodes}
                        onRename={async (key) => {
                          await docFlush.current();
                          store.change((w) => renameNode(w, selectedNode.id, key));
                        }}
                      />
                      <NumberField
                        label="Font size (px)"
                        value={selectedNode.fontSize ?? canvasSettings(workspace).nodeFontSize}
                        min={12}
                        max={48}
                        onChange={(fontSize) => changeNode(selectedNode.id, { fontSize })}
                      />
                      <button
                        className="text-button font-reset"
                        disabled={selectedNode.fontSize === undefined}
                        onClick={() => changeNode(selectedNode.id, { fontSize: undefined })}
                      >
                        Use workspace font size
                      </button>
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
                        {!selectedNode.expanded && (
                          <NumberField
                            label={selectedNode.type === 'terminal' ? 'Diameter' : 'Width'}
                            value={selectedNode.width}
                            min={selectedNode.type === 'terminal' ? 80 : 160}
                            onChange={(width) => changeNode(selectedNode.id, { width })}
                          />
                        )}
                        {selectedNode.type !== 'terminal' && !selectedNode.expanded && (
                          <NumberField
                            label="Height"
                            value={selectedNode.height}
                            min={64}
                            onChange={(height) => changeNode(selectedNode.id, { height })}
                          />
                        )}
                      </div>
                      {selectedNode.expanded && (
                        <p className="field-help" data-testid="container-dimensions">
                          Auto-sized to contents: {Math.round(selectedDisplayNode?.width || 0)} ×{' '}
                          {Math.round(selectedDisplayNode?.height || 0)}
                        </p>
                      )}
                      <div className="section-label">INTERNAL STRUCTURE</div>
                      <button className="explore-button" onClick={() => toggleNode(selectedNode)}>
                        <span>
                          <Icon name="layers" size={20} />
                          <strong>
                            {selectedNode.expanded ? 'Collapse subgraph' : 'Expand subgraph'}
                            <small>
                              {workspace.nodes.filter((n) => n.graphId === selectedNode.childGraphId).length}{' '}
                              internal services
                            </small>
                          </strong>
                        </span>
                        <Icon name="arrow" size={18} />
                      </button>
                      <div className="two-fields">
                        <button
                          className="secondary"
                          onClick={() => openNewNode(undefined, selectedNode.childGraphId)}
                        >
                          Add service inside
                        </button>
                        <button className="secondary" onClick={() => navigate(selectedNode.childGraphId)}>
                          Focus subgraph
                        </button>
                      </div>
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
                      {store.presentation && presentation.current ? (
                        <PresentationDocument
                          key={`presentation:${selectedNode.id}`}
                          node={selectedNode}
                          original={presentation.current.workspace}
                          token={store.token}
                          drafts={presentation.current.documents}
                        />
                      ) : (
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
                      )}
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
                                points: [],
                                routing: 'auto',
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
                    {selectedDisplayEdge?.projected && (
                      <p className="field-help proxy-notice">
                        Expand the endpoint's container to edit this path.
                      </p>
                    )}
                    {selectedDisplayEdge &&
                      !selectedDisplayEdge.projected &&
                      !selectedDisplayEdge.editable && (
                        <p className="field-help proxy-notice">
                          Collapse the expanded services to edit the saved path.
                        </p>
                      )}
                    {!selectedDisplayEdge && (
                      <p className="field-help proxy-notice">Open this flow in Overview to edit its path.</p>
                    )}
                    <label className="field">
                      Path segment
                      <select
                        aria-label="Path segment"
                        disabled={!selectedDisplayEdge?.editable}
                        value={Math.min(segmentIndex, (selectedDisplayEdge?.points.length ?? 2) - 2)}
                        onChange={(e) => setSegmentIndex(Number(e.target.value))}
                      >
                        {(selectedDisplayEdge?.points ?? []).slice(0, -1).map((p, i) => (
                          <option key={i} value={i}>
                            Segment {i + 1} ·{' '}
                            {p.y === selectedDisplayEdge!.points[i + 1].y ? 'Horizontal' : 'Vertical'}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="two-fields">
                      <button
                        className="secondary"
                        disabled={!selectedDisplayEdge?.editable}
                        onClick={() =>
                          changeEdge(selectedEdge.id, {
                            points: canonicalEdgePoints(
                              workspace,
                              selectedDisplayEdge!,
                              addBend(
                                selectedDisplayEdge!.points,
                                Math.min(segmentIndex, selectedDisplayEdge!.points.length - 2),
                              ),
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
                            points: [],
                            routing: 'auto',
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
                          sourceNodeId: selectedEdge.targetNodeId,
                          targetNodeId: selectedEdge.sourceNodeId,
                          sourceSide: selectedEdge.targetSide,
                          targetSide: selectedEdge.sourceSide,
                          points: [...selectedEdge.points].reverse(),
                          routing: selectedEdge.routing ?? 'manual',
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
                    <button
                      className="secondary full-width"
                      onClick={() => downloadJSON(workspace, 'workspace.json')}
                      disabled={store.presentation}
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
              : 'Service Atlas'}
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
          onCreate={async (key, type) => {
            await docFlush.current();
            const id = uid(),
              childGraphId = uid();
            const targetGraphId = newNodeGraph.current || graphId;
            const index = workspace.nodes.filter((node) => node.graphId === targetGraphId).length;
            const settings = canvasSettings(workspace);
            const snap = (value: number) => snapCoordinate(value, settings);
            store.change((w) => {
              let next: Workspace = {
                ...w,
                nodes: [
                  ...w.nodes,
                  {
                    id,
                    key,
                    graphId: targetGraphId,
                    childGraphId,
                    type,
                    x: snap(newNodePosition.current?.x ?? 40 + (index % 3) * 300),
                    y: snap(newNodePosition.current?.y ?? 60 + Math.floor(index / 3) * 220),
                    width: snap(type === 'terminal' ? 144 : 224),
                    height: snap(type === 'terminal' ? 144 : 88),
                  },
                ],
                graphs: [...w.graphs, { id: childGraphId, parentNodeId: id }],
              };
              const owner = next.nodes.find((node) => node.childGraphId === targetGraphId);
              if (owner && !owner.expanded && targetGraphId !== graphId)
                next = toggleExpanded(next, owner.id);
              return updateNodeGeometry(next, id, {});
            });
            setSelection({ type: 'node', id });
            setInspectorTab('properties');
            setModal(null);
          }}
        />
      )}
      {modal === 'flow' && (
        <FlowDialog nodes={workspace?.nodes || []} onClose={() => setModal(null)} onCreate={addFlow} />
      )}
      {modal === 'settings' && (
        <SettingsPage onClose={() => setModal(null)}>
          {workspace ? (
            <CanvasSettings
              value={canvasSettings(workspace)}
              onChange={(canvas) => store.change((w) => ({ ...w, canvas }))}
              appearance={nodeAppearance(workspace)}
              onAppearanceChange={(nodeAppearance) =>
                store.change((w) => ({ ...w, nodeAppearance }), { historyKey: 'node-appearance' })
              }
              themePicker={<ThemePicker inline value={theme} onChange={changeTheme} />}
            />
          ) : (
            <section>
              <h3>Canvas</h3>
              <ThemePicker inline value={theme} onChange={changeTheme} />
              <p>Open a workspace to configure the canvas and node appearance.</p>
            </section>
          )}
        </SettingsPage>
      )}
      {modal === 'move' && movingNode && workspace && (
        <Modal title={`Move ${movingNode.key}`} onClose={() => setModal(null)}>
          <p className="modal-intro">
            Move this service and its entire subtree. Documents, service keys, and connected flows stay with
            it.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void action(() => {
                store.change((w) => moveToGraph(w, movingNode.id, moveGraphId));
                setGraphId(moveGraphId);
                setView(views.current[moveGraphId] || initialView());
                setSelection({ type: 'node', id: movingNode.id });
                setModal(null);
              });
            }}
          >
            <label className="field">
              Destination graph
              <select
                aria-label="Destination graph"
                value={moveGraphId}
                onChange={(event) => setMoveGraphId(event.target.value)}
              >
                {destinations.map((graph) => (
                  <option key={graph.id} value={graph.id}>
                    {graph.id === workspace.rootGraphId
                      ? 'Root graph'
                      : `Inside ${workspace.nodes.find((node) => node.id === graph.parentNodeId)?.key}`}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={() => setModal(null)}>
                Cancel
              </button>
              <button className="primary" disabled={!moveGraphId}>
                Move service
              </button>
            </div>
          </form>
        </Modal>
      )}
      {modal === 'delete' && workspace && selections.length > 0 && (
        <Modal
          title={
            selections.length > 1
              ? `Delete ${selections.length} selected elements?`
              : selectedNode
                ? 'Delete this service?'
                : 'Delete this flow?'
          }
          onClose={() => setModal(null)}
        >
          <p className="modal-intro">
            {selections.length > 1
              ? 'Selected services, their descendants, connected flows, and matching Markdown files will be removed. Selected flows will also be removed.'
              : selectedNode
                ? `Deleting “${selectedNode.key}” also deletes its nested services, connected flows, and all corresponding Markdown files.`
                : 'This data flow and its saved path will be removed.'}{' '}
            You can undo this during the current editing session.
          </p>
          <div className="modal-actions">
            <button className="secondary" onClick={() => setModal(null)}>
              Cancel
            </button>
            <button
              className="danger"
              onClick={() =>
                void action(() => {
                  store.change((w) => {
                    let next = w;
                    for (const item of selections) {
                      if (item.type === 'node' && next.nodes.some((node) => node.id === item.id))
                        next = removeNode(next, item.id);
                    }
                    const edgeIds = new Set(
                      selections.filter((item) => item.type === 'edge').map((item) => item.id),
                    );
                    next = { ...next, edges: next.edges.filter((edge) => !edgeIds.has(edge.id)) };
                    return relayoutWorkspace(next);
                  });
                  setSelection(null);
                  setModal(null);
                })
              }
            >
              <Icon name="trash" size={16} />
              {selections.length > 1
                ? 'Delete selected elements'
                : selectedNode
                  ? 'Delete service and documents'
                  : 'Delete flow'}
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
                  Hover or select a service to reveal its white anchors. Drag an anchor to any visible
                  service, including a nested service. The left anchor shows incoming flows; the right shows
                  outgoing flows, including every nested service's contribution. Each flow counts once per
                  direction for a service and its descendants. Select a flow to edit weights, change ports,
                  add bends, or drag segment handles. Connections stay orthogonal as services move.
                </p>
              </section>
            </div>
            <div>
              <Icon name="layers" />
              <section>
                <h3>Explore every level</h3>
                <p>
                  Double-click a service or press <kbd>Enter</kbd> to expand or collapse it on this canvas.
                  Use Add service inside to build its subgraph. Focus subgraph opens a dedicated view with
                  breadcrumbs. Expanded containers fit their contents automatically. Collapsed cross-level
                  flows use solid proxy connections; internal flows are hidden. Keys stay unique throughout
                  the entire workspace.
                </p>
              </section>
            </div>
            <div>
              <Icon name="check" />
              <section>
                <h3>Keep your work</h3>
                <p>
                  Changes save automatically. <kbd>Ctrl S</kbd> saves immediately. Use <kbd>Ctrl/Cmd Z</kbd>
                  to undo graph changes and <kbd>Ctrl/Cmd Shift Z</kbd> to redo. History lasts for this open
                  workspace session; a drag is one step. In text fields these keys edit the text normally. If
                  a save fails, keep this tab open and use Retry save. Your current edits remain on the
                  canvas; a recovery JSON can also be downloaded.
                </p>
              </section>
            </div>
            <p className="field-help">
              Drag the empty canvas to select multiple elements. Hold <kbd>Shift</kbd> to add to the
              selection; Shift-click to toggle one element. Drag a selected service to move the group. Hold{' '}
              <kbd>Space</kbd>
              while dragging, or drag with the right or middle mouse button, to pan. Scroll to zoom. Press{' '}
              <kbd>1</kbd> to fit the graph and <kbd>Esc</kbd> to cancel a connection. Right-click the canvas,
              a service, or a flow for contextual actions. The top-left button collapses the sidebar. Deleting
              a service also deletes its nested services and Markdown files.
            </p>
          </div>
        </Modal>
      )}
    </div>
  );
}
