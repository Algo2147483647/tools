import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { AutosaveController, type ChangeOptions, type SaveResult } from './autosave';
import { validateWorkspace, type Workspace } from './model';

interface OpenResult {
  workspace: Workspace;
  path: string;
  token: string;
}
interface Draft {
  workspace: Workspace;
  updatedAt: string;
  /** Previously persisted nodes whose missing documents must be restored, never recreated. */
  restoringNodeIds?: string[];
}
interface DraftStore {
  pending: Draft | null;
  recoveries: Draft[];
}

class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
  }
}

async function request<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok)
    throw new ApiError(data.error || `Request failed (${response.status}).`, response.status, data.code);
  return data as T;
}

const storageKey = (path: string) =>
  `service-flow-editor:draft:${path.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase()}`;
function readDrafts(path: string): DraftStore {
  const raw = localStorage.getItem(storageKey(path));
  if (!raw) return { pending: null, recoveries: [] };
  const record = JSON.parse(raw) as DraftStore;
  if (!record || !Array.isArray(record.recoveries))
    throw new Error('The browser recovery draft is unreadable.');
  for (const entry of [...record.recoveries, ...(record.pending ? [record.pending] : [])]) {
    entry.workspace = validateWorkspace(entry.workspace);
    if (entry.restoringNodeIds !== undefined) {
      const nodeIds = new Set(entry.workspace.nodes.map((node) => node.id));
      if (
        !Array.isArray(entry.restoringNodeIds) ||
        !entry.restoringNodeIds.every((id) => typeof id === 'string' && nodeIds.has(id))
      )
        throw new Error('The browser recovery draft contains invalid document restoration identities.');
    }
  }
  return record;
}

function writeDrafts(path: string, record: DraftStore) {
  if (record.pending || record.recoveries.length)
    localStorage.setItem(storageKey(path), JSON.stringify(record));
  else localStorage.removeItem(storageKey(path));
}

export function useWorkspace() {
  const session = useRef({ path: '', token: '' });
  const persistedNodeIds = useRef(new Set<string>());
  const suppressDraft = useRef(false);
  const operations = useRef<Promise<unknown>>(Promise.resolve());
  const [path, setPath] = useState('');
  const [token, setToken] = useState('');
  const [recoveryMessage, setRecoveryMessage] = useState<string | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<Workspace | null>(null);
  const [controller] = useState(
    () =>
      new AutosaveController<Workspace>(async (workspace) => {
        const saveRequest = () =>
          request<SaveResult<Workspace>>('/api/workspace/save', {
            token: session.current.token,
            workspace,
            restoringNodeIds: workspace.nodes
              .filter((node) => persistedNodeIds.current.has(node.id))
              .map((node) => node.id),
          });
        let result: SaveResult<Workspace>;
        try {
          result = await saveRequest();
        } catch (error) {
          if (!(error instanceof ApiError) || error.code !== 'TOKEN_EXPIRED') throw error;
          // A restarted local server loses tokens, but never bypass disk revisions.
          const reopened = await request<OpenResult>('/api/workspace/open', { path: session.current.path });
          if (reopened.workspace.revision !== workspace.revision) {
            throw new Error(
              'The workspace changed on disk while the server was disconnected. Download your current JSON before reloading to preserve your edits.',
            );
          }
          session.current.token = reopened.token;
          setToken(reopened.token);
          result = await saveRequest();
        }
        for (const node of result.workspace.nodes) persistedNodeIds.current.add(node.id);
        return result;
      }),
  );
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(
    () =>
      controller.subscribe(() => {
        if (!session.current.path || suppressDraft.current) return;
        const current = controller.getSnapshot();
        if (current.presentation) return;
        if (!current.workspace) return;
        try {
          const drafts = readDrafts(session.current.path);
          drafts.pending =
            current.status === 'saved'
              ? null
              : {
                  workspace: current.workspace,
                  updatedAt: new Date().toISOString(),
                  restoringNodeIds: current.workspace.nodes
                    .filter((node) => persistedNodeIds.current.has(node.id))
                    .map((node) => node.id),
                };
          writeDrafts(session.current.path, drafts);
        } catch {
          setRecoveryMessage(
            'Browser recovery storage is unavailable. Keep this tab open until the workspace is saved.',
          );
        }
      }),
    [controller],
  );

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (['pending', 'saving', 'error'].includes(controller.getSnapshot().status)) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [controller]);

  const enqueue = useCallback((operation: () => Promise<void>): Promise<void> => {
    const next = operations.current.catch(() => {}).then(operation);
    operations.current = next;
    return next;
  }, []);

  const open = useCallback(
    (requestedPath: string, create = false, name?: string) =>
      enqueue(async () => {
        if (controller.getSnapshot().presentation)
          throw new Error('Exit presentation mode before changing workspaces.');
        await controller.flush();
        const beforeOpening = controller.getSnapshot().workspace;
        const result = await request<OpenResult>('/api/workspace/open', {
          path: requestedPath,
          create,
          name,
        });
        let workspace = validateWorkspace(result.workspace);
        // The previous canvas remains editable while the new workspace is opening.
        await controller.flush();
        const latest = controller.getSnapshot().workspace;
        if (
          session.current.path &&
          storageKey(result.path) === storageKey(session.current.path) &&
          latest &&
          latest !== beforeOpening
        ) {
          // Reopening the same folder must not restore a response captured before
          // the second flush committed edits made while the open request was running.
          workspace = latest;
        }
        let drafts: DraftStore = { pending: null, recoveries: [] };
        let message: string | null = null;
        try {
          drafts = readDrafts(result.path);
        } catch {
          message = 'The browser recovery draft could not be read. The saved workspace was opened.';
        }
        const pending = drafts.pending;
        const compatibleDraft = pending && pending.workspace.revision === workspace.revision;
        if (pending && !compatibleDraft) {
          drafts.recoveries.push(pending);
          drafts.pending = null;
          try {
            writeDrafts(result.path, drafts);
          } catch {
            message =
              'The recovery draft could not be archived in browser storage. Download it before leaving this tab.';
          }
        }
        suppressDraft.current = true;
        session.current = { path: result.path, token: result.token };
        setPath(result.path);
        setToken(result.token);
        persistedNodeIds.current = new Set(workspace.nodes.map((node) => node.id));
        if (compatibleDraft)
          for (const id of pending.restoringNodeIds || []) persistedNodeIds.current.add(id);
        controller.load(workspace);
        suppressDraft.current = false;
        const rescue = drafts.recoveries.at(-1)?.workspace ?? null;
        setRecoveryDraft(rescue);
        if (compatibleDraft) {
          controller.change(() => pending.workspace, { recordHistory: false });
          message =
            'Recovered unsaved changes from this browser. The restored workspace will be saved automatically.';
        } else if (rescue && !message) {
          message =
            'A browser recovery draft was based on an older revision. The disk version is open; download the recovery JSON to preserve those edits.';
        }
        setRecoveryMessage(message);
      }),
    [controller, enqueue],
  );

  const close = useCallback(
    () =>
      enqueue(async () => {
        await controller.flush();
        controller.load(null);
        session.current = { path: '', token: '' };
        persistedNodeIds.current.clear();
        setPath('');
        setToken('');
        setRecoveryMessage(null);
        setRecoveryDraft(null);
      }),
    [controller, enqueue],
  );

  const discardRecoveryDraft = useCallback(() => {
    if (controller.getSnapshot().presentation) return;
    if (session.current.path) {
      try {
        const drafts = readDrafts(session.current.path);
        drafts.recoveries.pop();
        writeDrafts(session.current.path, drafts);
        const next = drafts.recoveries.at(-1)?.workspace ?? null;
        setRecoveryDraft(next);
        setRecoveryMessage(
          next ? 'An older recovery draft is also available. Download it before dismissing.' : null,
        );
      } catch {
        setRecoveryMessage('The recovery draft could not be removed from browser storage.');
      }
    } else {
      setRecoveryMessage(null);
      setRecoveryDraft(null);
    }
  }, [controller]);

  return {
    ...snapshot,
    path,
    token,
    recoveryMessage,
    recoveryDraft,
    open,
    close,
    change: useCallback(
      (updater: (workspace: Workspace) => Workspace, options?: ChangeOptions) =>
        controller.change(updater, options),
      [controller],
    ),
    retry: controller.retry,
    flush: controller.flush,
    undo: controller.undo,
    redo: controller.redo,
    beginHistoryGroup: controller.beginHistoryGroup,
    endHistoryGroup: controller.endHistoryGroup,
    discardRecoveryDraft,
    enterPresentation: controller.enterPresentation,
    exitPresentation: controller.exitPresentation,
  };
}
