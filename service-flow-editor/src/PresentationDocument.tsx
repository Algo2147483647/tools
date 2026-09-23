import { useEffect, useState } from 'react';
import type { ServiceNode, Workspace } from './model';

/** A memory-only editor, deliberately separate from disk autosave and recovery drafts. */
export default function PresentationDocument({
  node,
  original,
  token,
  drafts,
}: {
  node: ServiceNode;
  original: Workspace;
  token: string;
  drafts: Map<string, string>;
}) {
  const [content, setContent] = useState(drafts.get(node.id) ?? '');
  const [loading, setLoading] = useState(!drafts.has(node.id));
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    if (drafts.has(node.id)) {
      setLoading(false);
      return;
    }
    const saved = original.nodes.find((item) => item.id === node.id);
    const load = saved
      ? fetch(`/api/document?${new URLSearchParams({ token, key: saved.key })}`).then(async (response) => {
          const data = await response.json();
          if (!response.ok) throw new Error(data.error);
          return data.content as string;
        })
      : Promise.resolve(`# ${node.key}\n\n`);
    void load
      .then((value) => {
        drafts.set(node.id, value);
        if (active) {
          setContent(value);
          setLoading(false);
        }
      })
      .catch((reason) => {
        if (active) {
          setError(String(reason));
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [node.id, original, token, drafts]);
  return (
    <div className="presentation-document">
      <p className="field-help">Temporary notes · discarded when you exit presentation.</p>
      {error && <p role="alert">{error}</p>}
      <textarea
        aria-label="Service Markdown"
        value={content}
        disabled={loading || !!error}
        onChange={(event) => {
          setContent(event.target.value);
          drafts.set(node.id, event.target.value);
        }}
      />
    </div>
  );
}
