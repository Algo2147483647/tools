import { buildTimestampFileName, ensureJsonExtension } from "../adapters/download";

interface SaveJsonModalProps {
  open: boolean;
  sourceFileName: string;
  canOverwrite: boolean;
  previousContent: string;
  currentContent: string;
  onOverwrite: () => void;
  onSaveNew: () => void;
  onClose: () => void;
}

type DiffLine =
  | { kind: "context"; oldLine: number; newLine: number; text: string }
  | { kind: "remove"; oldLine: number; newLine: null; text: string }
  | { kind: "add"; oldLine: null; newLine: number; text: string };

export default function SaveJsonModal({
  open,
  sourceFileName,
  canOverwrite,
  previousContent,
  currentContent,
  onOverwrite,
  onSaveNew,
  onClose,
}: SaveJsonModalProps) {
  if (!open) {
    return null;
  }

  const normalizedFileName = ensureJsonExtension(sourceFileName || "graph.json");
  const newFileName = buildTimestampFileName(normalizedFileName);
  const diffLines = buildLineDiff(previousContent, currentContent);
  const summary = summarizeDiff(diffLines);

  return (
    <div id="save-json-modal" className="save-json-modal is-visible" aria-hidden="false">
      <div className="save-json-dialog" role="dialog" aria-modal="true" aria-labelledby="save-json-title">
        <div className="save-json-header">
          <div>
            <p id="save-json-title" className="save-json-eyebrow">Save Graph JSON</p>
          </div>
          <button id="save-json-cancel-top" className="ghost-btn modal-icon-close-btn" type="button" title="Close" aria-label="Close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>
        <section className="save-json-review" aria-label="JSON changes review">
          <div className="save-json-review__header">
            <div>
              <h4>{normalizedFileName}</h4>
            </div>
            <div className="save-json-review__stats" aria-label="Diff summary">
              <span className="save-json-review__stat save-json-review__stat--add">+{summary.added}</span>
              <span className="save-json-review__stat save-json-review__stat--remove">-{summary.removed}</span>
            </div>
          </div>
          {summary.changed ? (
            <pre className="save-json-diff" aria-label="JSON diff">
              {diffLines.map((line, index) => (
                <DiffLineView key={`${line.kind}-${index}-${line.oldLine || ""}-${line.newLine || ""}`} line={line} />
              ))}
            </pre>
          ) : (
            <div className="save-json-no-diff">No JSON changes since the last saved revision.</div>
          )}
        </section>
        <div className="save-json-actions">
          <button id="save-json-overwrite" className="primary-btn save-json-overwrite-btn" type="button" disabled={!canOverwrite} title={canOverwrite ? `Overwrite ${normalizedFileName}` : "Open the JSON with file access to enable direct overwrite."} onClick={onOverwrite}>Overwrite Original</button>
          <button id="save-json-new" className="ghost-btn" type="button" onClick={onSaveNew}>Save New Copy</button>
          <button id="save-json-cancel" className="ghost-btn" type="button" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="modal-icon-close-svg" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 6L18 18" />
      <path d="M18 6L6 18" />
    </svg>
  );
}

function DiffLineView({ line }: { line: DiffLine }) {
  const marker = line.kind === "add" ? "+" : line.kind === "remove" ? "-" : " ";
  const oldLine = line.oldLine === null ? "" : String(line.oldLine);
  const newLine = line.newLine === null ? "" : String(line.newLine);

  return (
    <span className={`save-json-diff__line save-json-diff__line--${line.kind}`}>
      <span className="save-json-diff__line-number">{oldLine}</span>
      <span className="save-json-diff__line-number">{newLine}</span>
      <span className="save-json-diff__marker">{marker}</span>
      <span className="save-json-diff__text">{line.text || " "}</span>
      {"\n"}
    </span>
  );
}

function summarizeDiff(lines: DiffLine[]) {
  const added = lines.filter((line) => line.kind === "add").length;
  const removed = lines.filter((line) => line.kind === "remove").length;
  return {
    added,
    removed,
    changed: added + removed > 0,
  };
}

function buildLineDiff(previousContent: string, currentContent: string): DiffLine[] {
  const oldLines = splitLines(previousContent);
  const newLines = splitLines(currentContent);
  let prefixLength = 0;
  while (
    prefixLength < oldLines.length
    && prefixLength < newLines.length
    && oldLines[prefixLength] === newLines[prefixLength]
  ) {
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < oldLines.length - prefixLength
    && suffixLength < newLines.length - prefixLength
    && oldLines[oldLines.length - 1 - suffixLength] === newLines[newLines.length - 1 - suffixLength]
  ) {
    suffixLength += 1;
  }

  const oldMiddle = oldLines.slice(prefixLength, oldLines.length - suffixLength);
  const newMiddle = newLines.slice(prefixLength, newLines.length - suffixLength);
  const output: DiffLine[] = [];

  for (let index = 0; index < prefixLength; index += 1) {
    output.push({ kind: "context", oldLine: index + 1, newLine: index + 1, text: oldLines[index] });
  }

  output.push(...buildMiddleDiff(oldMiddle, newMiddle, prefixLength + 1, prefixLength + 1));

  for (let index = 0; index < suffixLength; index += 1) {
    const oldIndex = oldLines.length - suffixLength + index;
    const newIndex = newLines.length - suffixLength + index;
    output.push({ kind: "context", oldLine: oldIndex + 1, newLine: newIndex + 1, text: oldLines[oldIndex] });
  }

  return output;
}

function buildMiddleDiff(oldLines: string[], newLines: string[], oldStartLine: number, newStartLine: number): DiffLine[] {
  if (!oldLines.length) {
    return newLines.map((text, index) => ({ kind: "add", oldLine: null, newLine: newStartLine + index, text }));
  }
  if (!newLines.length) {
    return oldLines.map((text, index) => ({ kind: "remove", oldLine: oldStartLine + index, newLine: null, text }));
  }
  if (oldLines.length * newLines.length > 250000) {
    return [
      ...oldLines.map((text, index): DiffLine => ({ kind: "remove", oldLine: oldStartLine + index, newLine: null, text })),
      ...newLines.map((text, index): DiffLine => ({ kind: "add", oldLine: null, newLine: newStartLine + index, text })),
    ];
  }

  const table = buildLcsTable(oldLines, newLines);
  const output: DiffLine[] = [];
  let oldIndex = 0;
  let newIndex = 0;

  while (oldIndex < oldLines.length || newIndex < newLines.length) {
    if (oldIndex < oldLines.length && newIndex < newLines.length && oldLines[oldIndex] === newLines[newIndex]) {
      output.push({
        kind: "context",
        oldLine: oldStartLine + oldIndex,
        newLine: newStartLine + newIndex,
        text: oldLines[oldIndex],
      });
      oldIndex += 1;
      newIndex += 1;
      continue;
    }
    if (newIndex < newLines.length && (oldIndex === oldLines.length || table[oldIndex][newIndex + 1] >= table[oldIndex + 1][newIndex])) {
      output.push({ kind: "add", oldLine: null, newLine: newStartLine + newIndex, text: newLines[newIndex] });
      newIndex += 1;
      continue;
    }
    if (oldIndex < oldLines.length) {
      output.push({ kind: "remove", oldLine: oldStartLine + oldIndex, newLine: null, text: oldLines[oldIndex] });
      oldIndex += 1;
    }
  }

  return output;
}

function buildLcsTable(oldLines: string[], newLines: string[]): number[][] {
  const table = Array.from({ length: oldLines.length + 1 }, () => Array(newLines.length + 1).fill(0));
  for (let oldIndex = oldLines.length - 1; oldIndex >= 0; oldIndex -= 1) {
    for (let newIndex = newLines.length - 1; newIndex >= 0; newIndex -= 1) {
      table[oldIndex][newIndex] = oldLines[oldIndex] === newLines[newIndex]
        ? table[oldIndex + 1][newIndex + 1] + 1
        : Math.max(table[oldIndex + 1][newIndex], table[oldIndex][newIndex + 1]);
    }
  }
  return table;
}

function splitLines(content: string): string[] {
  if (!content) {
    return [];
  }
  return content.replace(/\r\n/g, "\n").split("\n");
}
