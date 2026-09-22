import { useEffect, useRef, useState, type MutableRefObject } from 'react';
import Icon from './Icon';

type DocumentStatus = 'loading' | 'saved' | 'pending' | 'saving' | 'error';
interface Draft {
  content: string;
  base: string;
}
interface Props {
  workspacePath: string;
  nodeId: string;
  nodeKey: string;
  token: string;
  flushGraph: () => Promise<void>;
  flushRef: MutableRefObject<() => Promise<void>>;
  retryRef?: MutableRefObject<() => Promise<void>>;
  onStatus: (status: string, error: string) => void;
}
interface ApiResult {
  error?: string;
  code?: string;
  content?: string;
  token?: string;
  workspace?: { nodes: { id: string; key: string }[] };
}
function isDraft(value: unknown): value is Draft {
  return (
    !!value &&
    typeof value === 'object' &&
    typeof (value as Draft).content === 'string' &&
    typeof (value as Draft).base === 'string'
  );
}
function download(content: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function DocumentEditor({
  workspacePath,
  nodeId,
  nodeKey,
  token,
  flushGraph,
  flushRef,
  retryRef,
  onStatus,
}: Props) {
  const [content, setContent] = useState('');
  const [status, setStatus] = useState<DocumentStatus>('loading');
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');
  const [recoveries, setRecoveries] = useState<Draft[]>([]);
  const [reload, setReload] = useState(0);
  const text = useRef(''),
    base = useRef('');
  const version = useRef(0),
    savedVersion = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<void> | null>(null);
  const refreshInFlight = useRef<Promise<string> | null>(null);
  const loaded = useRef(false),
    mounted = useRef(true);
  const graphFlush = useRef(flushGraph);
  graphFlush.current = flushGraph;
  const statusCallback = useRef(onStatus);
  statusCallback.current = onStatus;
  const tokenRef = useRef(token),
    lastTokenProp = useRef(token);
  // An independently renewed document token survives ordinary parent renders.
  if (lastTokenProp.current !== token) {
    tokenRef.current = token;
    lastTokenProp.current = token;
  }
  const normalizedPath = workspacePath.replace(/\\/g, '/').replace(/\/$/, '').toLowerCase();
  const draftKey = `service-atlas-document:${normalizedPath}:${nodeId}`;
  const recoveryKey = `${draftKey}:recoveries`;

  function rememberDraft() {
    try {
      localStorage.setItem(
        draftKey,
        JSON.stringify({ content: text.current, base: base.current } satisfies Draft),
      );
    } catch {
      if (mounted.current)
        setWarning('Browser draft storage is unavailable. Keep this tab open until your document is saved.');
    }
  }

  async function renewSession(): Promise<string> {
    if (refreshInFlight.current) return refreshInFlight.current;
    const refresh = async () => {
      const response = await fetch('/api/workspace/open', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: workspacePath }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.token)
        throw new Error(
          result.error || 'Could not reconnect to the workspace. Your document text is retained.',
        );
      const current = result.workspace?.nodes.find((node) => node.id === nodeId);
      if (!current || current.key !== nodeKey)
        throw new Error(
          'This service changed on disk while disconnected. Download your current notes, then reload this tab and reopen the workspace.',
        );
      tokenRef.current = result.token;
      return result.token;
    };
    refreshInFlight.current = refresh();
    try {
      return await refreshInFlight.current;
    } finally {
      refreshInFlight.current = null;
    }
  }

  async function documentRequest(method: 'GET' | 'PUT', snapshot?: string): Promise<ApiResult> {
    async function send(authToken: string) {
      const response = await fetch(
        method === 'GET'
          ? `/api/document?${new URLSearchParams({ token: authToken, key: nodeKey })}`
          : '/api/document',
        method === 'GET'
          ? undefined
          : {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ token: authToken, key: nodeKey, content: snapshot }),
            },
      );
      return { response, result: (await response.json()) as ApiResult };
    }
    const firstToken = tokenRef.current;
    let result = await send(firstToken);
    if (result.response.status === 401 && result.result.code === 'TOKEN_EXPIRED') {
      const authToken = tokenRef.current !== firstToken ? tokenRef.current : await renewSession();
      result = await send(authToken);
    }
    if (!result.response.ok)
      throw new Error(result.result.error || 'Could not access this document. Your text is still here.');
    return result.result;
  }

  async function flush(): Promise<void> {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (inFlight.current) {
      await inFlight.current;
      if (version.current !== savedVersion.current) return flush();
      return;
    }
    // An unloaded document has no live edits. Structural repairs must remain usable
    // when a graph save error prevents the Markdown file from being opened.
    if (!loaded.current) return;
    if (version.current === savedVersion.current) return;
    const save = async () => {
      try {
        await graphFlush.current();
        while (version.current !== savedVersion.current) {
          const snapshot = text.current,
            sequence = version.current;
          if (mounted.current) {
            setStatus('saving');
            setError('');
          }
          await documentRequest('PUT', snapshot);
          base.current = snapshot;
          savedVersion.current = sequence;
          if (version.current !== sequence) rememberDraft();
        }
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* An already-saved draft is recognized on the next load. */
        }
        try {
          const archived: unknown = JSON.parse(localStorage.getItem(recoveryKey) || '[]');
          if (Array.isArray(archived) && archived.every(isDraft)) {
            const remaining = archived.filter((draft) => draft.content !== base.current);
            if (remaining.length) localStorage.setItem(recoveryKey, JSON.stringify(remaining));
            else localStorage.removeItem(recoveryKey);
            if (mounted.current) setRecoveries(remaining);
          }
        } catch {
          /* Preserve recovery records when browser storage is unavailable. */
        }
        if (mounted.current) {
          setStatus('saved');
          setError('');
        }
      } catch (err) {
        rememberDraft();
        if (mounted.current) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
        throw err;
      }
    };
    inFlight.current = save();
    try {
      await inFlight.current;
    } finally {
      inFlight.current = null;
    }
  }
  const flushLatest = useRef(flush);
  flushLatest.current = flush;
  function scheduleSave() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flushLatest.current().catch(() => {});
    }, 650);
  }

  useEffect(() => {
    statusCallback.current(status, error);
  }, [status, error]);
  useEffect(() => {
    mounted.current = true;
    const fn = () => flushLatest.current();
    flushRef.current = fn;
    const retry = async () => {
      if (!loaded.current) setReload((value) => value + 1);
      else await flushLatest.current();
    };
    if (retryRef) retryRef.current = retry;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (version.current !== savedVersion.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      mounted.current = false;
      if (timer.current) clearTimeout(timer.current);
      if (flushRef.current === fn) flushRef.current = async () => {};
      if (retryRef?.current === retry) retryRef.current = async () => {};
      statusCallback.current('saved', '');
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [flushRef, retryRef]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      loaded.current = false;
      version.current = 0;
      savedVersion.current = 0;
      setStatus('loading');
      setError('');
      setWarning('');
      try {
        await graphFlush.current();
        const data = await documentRequest('GET');
        if (cancelled) return;
        if (typeof data.content !== 'string') throw new Error('The document response did not contain text.');
        let draft: Draft | null = null;
        let savedRecoveries: Draft[] = [];
        try {
          const rawDraft = localStorage.getItem(draftKey);
          const parsed: unknown = rawDraft ? JSON.parse(rawDraft) : null;
          if (parsed !== null && !isDraft(parsed)) throw new Error('Invalid document draft');
          draft = parsed;
          const rawRecoveries: unknown = JSON.parse(localStorage.getItem(recoveryKey) || '[]');
          if (!Array.isArray(rawRecoveries) || !rawRecoveries.every(isDraft))
            throw new Error('Invalid recovered documents');
          savedRecoveries = rawRecoveries;
          if (draft?.content === data.content) {
            localStorage.removeItem(draftKey);
            draft = null;
          } else if (draft && draft.base !== data.content) {
            if (!savedRecoveries.some((item) => item.content === draft!.content && item.base === draft!.base))
              savedRecoveries.push(draft);
            // Archive successfully before removing the pending draft.
            localStorage.setItem(recoveryKey, JSON.stringify(savedRecoveries));
            localStorage.removeItem(draftKey);
            draft = null;
          }
        } catch {
          if (
            draft &&
            draft.base !== data.content &&
            !savedRecoveries.some((item) => item.content === draft!.content)
          )
            savedRecoveries.push(draft);
          if (draft?.base !== data.content) draft = null;
          setWarning(
            'Browser document recovery storage could not be updated. Download any recovered notes before leaving this tab.',
          );
        }
        base.current = data.content;
        text.current = draft?.content ?? data.content;
        version.current = draft ? 1 : 0;
        savedVersion.current = 0;
        setRecoveries(savedRecoveries);
        setContent(text.current);
        loaded.current = true;
        setStatus(draft ? 'pending' : 'saved');
        if (draft) scheduleSave();
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
    // Authentication changes never reload and replace unsaved editor text.
  }, [workspacePath, nodeId, nodeKey, reload]);

  function edit(next: string) {
    text.current = next;
    setContent(next);
    version.current += 1;
    setStatus('pending');
    setError('');
    rememberDraft();
    scheduleSave();
  }

  return (
    <section className="document-editor">
      <div className="document-heading">
        <Icon name="file" />
        <strong title={`${nodeKey}.md`}>{nodeKey}.md</strong>
        <span className={`tiny-status ${status}`}>
          {status === 'pending'
            ? 'Unsaved'
            : status === 'loading'
              ? 'Loading…'
              : status === 'saving'
                ? 'Saving…'
                : status === 'error'
                  ? 'Save issue'
                  : 'Saved'}
        </span>
      </div>
      <p className="field-help">Markdown stored directly in your workspace.</p>
      {error && (
        <div role="alert" className="inline-error">
          {error}
          <button
            onClick={() => (loaded.current ? void flush().catch(() => {}) : setReload((value) => value + 1))}
          >
            <Icon name="refresh" size={14} />
            Retry document
          </button>
          {loaded.current && (
            <button onClick={() => download(text.current, `${nodeKey}-unsaved.md`)}>
              Download current notes
            </button>
          )}
        </div>
      )}
      {warning && (
        <p role="status" className="field-help">
          {warning}
        </p>
      )}
      {recoveries.length > 0 && (
        <div role="alert" className="inline-error">
          <span>
            Recovered notes differ from the document on disk. The editor shows the current disk version; your
            recovered text is preserved.
          </span>
          {recoveries.map((draft, index) => (
            <button
              key={index}
              onClick={() => download(draft.content, `${nodeKey}-recovered-${index + 1}.md`)}
            >
              Download recovered notes {index + 1}
            </button>
          ))}
          <button
            disabled={!loaded.current}
            onClick={() => {
              edit(recoveries[recoveries.length - 1].content);
              void flush().catch(() => {});
            }}
          >
            Save latest recovered notes over this document
          </button>
        </div>
      )}
      <textarea
        aria-label="Service Markdown document"
        className="markdown-editor"
        spellCheck={false}
        value={content}
        disabled={!loaded.current}
        placeholder="# Service overview"
        onChange={(event) => edit(event.target.value)}
      />
    </section>
  );
}
