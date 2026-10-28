const source = document.getElementById('source');
const highlight = document.getElementById('highlight');
const root = document.getElementById('editor');
let language = 'auto';
let revision = 0;
let savedSelection = { start: 0, end: 0 };
let current = { text: '', language, start: 0, end: 0 };
const past = [];
const future = [];
let paintFrame;

export function inferLanguage(text) {
  if (/^\s*(?:[\[{"\d-]|true\s*$|false\s*$|null\s*$)/.test(text) && !/^\s*-\s+\S/m.test(text))
    return 'json';
  if (/^\s*(?:---\s*$|[^\s#][^\n]*:\s|[\w-]+:\s*$|-\s+\S)/m.test(text)) return 'yaml';
  return 'text';
}

function paint() {
  const text = source.value;
  const mode = language === 'auto' ? inferLanguage(text) : language;
  root.dataset.language = mode;
  root.classList.toggle('plain', text.length > 300_000 || mode === 'text');
  if (text.length > 300_000 || mode === 'text') {
    highlight.replaceChildren();
    return;
  }
  const pattern =
    mode === 'json'
      ? /"(?:\\[\s\S]|[^"\\])*(?:"|$)|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b|\b(?:true|false|null)\b/g
      : /#[^\n]*|"(?:\\.|[^"\\])*"|'(?:''|[^'])*'|^[ \t]*[^\n:#{}[\],]+(?=:\s|:$)|\b(?:true|false|null|yes|no)\b|-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/gm;
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    fragment.append(document.createTextNode(text.slice(offset, match.index)));
    const token = document.createElement('span');
    const raw = match[0];
    token.className =
      raw[0] === '#'
        ? 'token-comment'
        : /^\s*:/.test(text.slice(match.index + raw.length))
          ? 'token-key'
          : /^['"]/.test(raw)
            ? 'token-string'
            : /^-?\d/.test(raw)
              ? 'token-number'
              : /^(true|false|null|yes|no)$/.test(raw)
                ? 'token-literal'
                : 'token-key';
    token.textContent = raw;
    fragment.append(token);
    offset = match.index + raw.length;
  }
  fragment.append(document.createTextNode(text.slice(offset) + '\n'));
  highlight.replaceChildren(fragment);
  syncScroll();
}

function syncScroll() {
  highlight.scrollTop = source.scrollTop;
  highlight.scrollLeft = source.scrollLeft;
}

function read() {
  return { text: source.value, language, start: source.selectionStart, end: source.selectionEnd };
}

function capHistory() {
  let size = past.reduce((total, item) => total + item.text.length, 0);
  while (past.length > 100 || (size > 20_000_000 && past.length > 1))
    size -= past.shift().text.length;
}

function changed() {
  revision++;
  source.removeAttribute('aria-invalid');
  source.removeAttribute('title');
  cancelAnimationFrame(paintFrame);
  paintFrame = requestAnimationFrame(paint);
  source.dispatchEvent(new CustomEvent('editor-change', { bubbles: true }));
}

function restore(state) {
  source.value = state.text;
  language = state.language;
  source.setSelectionRange(state.start, state.end);
  savedSelection = { start: state.start, end: state.end };
  current = read();
  changed();
}

export function commit(text, mode = language) {
  past.push(read());
  capHistory();
  future.length = 0;
  restore({ text, language: mode, start: 0, end: 0 });
}

export function history(action) {
  const from = action === 'undo' ? past : future;
  const to = action === 'undo' ? future : past;
  if (!from.length) return false;
  to.push(read());
  restore(from.pop());
  return true;
}

export function captureSelection() {
  savedSelection = { start: source.selectionStart, end: source.selectionEnd };
  current.start = savedSelection.start;
  current.end = savedSelection.end;
  return { ...savedSelection };
}

export function snapshot() {
  return { text: source.value, language, revision, selection: { ...savedSelection } };
}

export function applyResult(result, baseRevision) {
  if (baseRevision !== revision) return { stale: true };
  if (result.effect === 'replace') commit(result.text, result.language);
  if (result.effect === 'editor') {
    if (result.action === 'language') commit(source.value, result.arguments.language);
    else return { changed: history(result.action) };
  }
  return { changed: result.effect !== 'report' };
}

export function focusEditor() {
  source.focus({ preventScroll: true });
  source.setSelectionRange(savedSelection.start, savedSelection.end);
}

export function showError(error) {
  source.setAttribute('aria-invalid', 'true');
  source.title = error.message;
}

source.addEventListener('beforeinput', (event) => {
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    history(event.inputType === 'historyUndo' ? 'undo' : 'redo');
  }
});
source.addEventListener('input', () => {
  past.push(current);
  capHistory();
  future.length = 0;
  current = read();
  captureSelection();
  changed();
});
source.addEventListener('select', captureSelection);
source.addEventListener('scroll', syncScroll);
source.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && ['z', 'y'].includes(event.key.toLowerCase())) {
    event.preventDefault();
    history(event.key.toLowerCase() === 'y' || event.shiftKey ? 'redo' : 'undo');
  }
  if (event.key === 'Tab') {
    event.preventDefault();
    const start = source.selectionStart,
      end = source.selectionEnd;
    let text, nextStart, nextEnd;
    if (start === end && !event.shiftKey) {
      text = source.value.slice(0, start) + '  ' + source.value.slice(end);
      nextStart = nextEnd = start + 2;
    } else {
      const from = source.value.lastIndexOf('\n', start - 1) + 1;
      const last = end > start && source.value[end - 1] === '\n' ? end - 1 : end;
      const stop = source.value.indexOf('\n', last);
      const until = stop === -1 ? source.value.length : stop;
      let first = 0,
        delta = 0;
      const body = source.value
        .slice(from, until)
        .split('\n')
        .map((line, index) => {
          const remove = event.shiftKey
            ? line.startsWith('\t')
              ? 1
              : Math.min(2, line.match(/^ */)[0].length)
            : 0;
          const change = event.shiftKey ? -remove : 2;
          if (!index) first = change;
          delta += change;
          return event.shiftKey ? line.slice(remove) : '  ' + line;
        })
        .join('\n');
      text = source.value.slice(0, from) + body + source.value.slice(until);
      nextStart = Math.max(from, start + first);
      nextEnd = Math.max(nextStart, end + delta);
    }
    commit(text);
    source.setSelectionRange(nextStart, nextEnd);
    captureSelection();
  }
});
source.addEventListener('dragover', (event) => {
  if (event.dataTransfer.types.includes('Files')) event.preventDefault();
});
source.addEventListener('drop', async (event) => {
  if (!event.dataTransfer.files.length) return;
  event.preventDefault();
  const file = event.dataTransfer.files[0];
  const base = revision;
  if (file.size > 8_000_000) return;
  const text = await file.text();
  if (revision === base && text.length <= 2_000_000) commit(text, 'auto');
});

const findBar = document.getElementById('find-bar');
const findInput = document.getElementById('find-text');
document.addEventListener('keydown', (event) => {
  if (
    (event.ctrlKey || event.metaKey) &&
    event.key.toLowerCase() === 'f' &&
    document.getElementById('console').hidden
  ) {
    event.preventDefault();
    findBar.hidden = false;
    findInput.focus();
    findInput.select();
  }
});
findBar.addEventListener('submit', (event) => {
  event.preventDefault();
  const query = findInput.value.toLocaleLowerCase();
  if (!query) return;
  const text = source.value.toLocaleLowerCase();
  let at = text.indexOf(query, source.selectionEnd);
  if (at < 0) at = text.indexOf(query);
  document.getElementById('find-status').textContent = at < 0 ? 'No match' : '';
  if (at >= 0) {
    source.focus();
    source.setSelectionRange(at, at + query.length);
    source.scrollTop = Math.max(
      0,
      (source.value.slice(0, at).split('\n').length - 3) *
        parseFloat(getComputedStyle(source).lineHeight),
    );
    captureSelection();
    findInput.focus();
  }
});
function closeFind() {
  findBar.hidden = true;
  focusEditor();
}
document.getElementById('find-close').onclick = closeFind;
findBar.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeFind();
  }
});
paint();
