import { type ReactNode,useLayoutEffect,useMemo,useRef } from "react";

interface NodeJsonViewProps {
  value: string;
  editable: boolean;
  onChange: (value: string) => void;
}

export default function NodeJsonView({ value, editable, onChange }: NodeJsonViewProps) {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLPreElement>(null);

  function syncScroll() {
    if (inputRef.current && highlightRef.current) {
      highlightRef.current.scrollTop = inputRef.current.scrollTop;
      highlightRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  }

  useLayoutEffect(syncScroll, [value, editable]);

  if (!editable) {
    return (
      <pre id="node-detail-json-preview" className="node-detail-json">
        <code>
          <JsonSyntax value={value} />
        </code>
      </pre>
    );
  }

  return (
    <div className="node-json-editor">
      <pre ref={highlightRef} className="node-json-editor__highlight" aria-hidden="true">
        <JsonSyntax value={value} />
        {"\n"}
      </pre>
      <textarea
        ref={inputRef}
        id="node-detail-json"
        aria-label="Raw JSON"
        className="node-json-editor__input"
        rows={18}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        onScroll={syncScroll}
      />
    </div>
  );
}

export function JsonSyntax({ value }: { value: string }) {
  const tokens = useMemo(() => {
    const result: ReactNode[] = [];
    // Highlight text without parsing it so incomplete drafts remain editable verbatim.
    const pattern = /"(?:\\.|[^"\\])*"|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b|[{}\[\],:]/g;
    let offset = 0;
    for (const match of value.matchAll(pattern)) {
      const index = match.index!;
      const token = match[0];
      if (index > offset) result.push(value.slice(offset, index));
      const kind = token.startsWith('"')
        ? /^\s*:/.test(value.slice(index + token.length))
          ? "key"
          : "string"
        : token === "true" || token === "false"
          ? "boolean"
          : token === "null"
            ? "null"
            : /^-?\d/.test(token)
              ? "number"
              : "punctuation";
      result.push(
        <span key={index} className={`node-json-token--${kind}`}>
          {token}
        </span>,
      );
      offset = index + token.length;
    }
    if (offset < value.length) result.push(value.slice(offset));
    return result;
  }, [value]);

  return <>{tokens}</>;
}
