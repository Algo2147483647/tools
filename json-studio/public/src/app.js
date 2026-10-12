import { JsonCore } from './json-core.js';
import { EditorCore } from './editor-core.js';
import { StudioCore } from './studio-core.js';

const $ = (id) => document.getElementById(id),
  source = $('source');
const sample =
  '{\n  "name": "JSON Studio",\n  "description": "A structured data workspace",\n  "version": 1.0,\n  "local": true,\n  "workspace": {\n    "theme": "paper",\n    "indent": 2,\n    "features": ["format", "escape", "inspect"]\n  },\n  "records": [\n    { "id": 9007199254740993, "label": "Exact number precision" },\n    { "id": 9007199254740994, "label": "Explore nested data" }\n  ],\n  "note": null\n}';
let parsed = null,
  error = null,
  view = 'tree',
  parseTimer,
  toastTimer,
  searchTimer;
let expansionDepth = 2,
  overrides = new Map(),
  limits = new Map(),
  inputVersion = 0;
let gutterFrame = 0,
  sourceLines = [''],
  lineTops = [19],
  lineStarts = [0],
  gutterHeight = 104,
  layoutKey = '';
let analysis = EditorCore.analyze(''),
  lastPair = '',
  importSequence = 0,
  releaseTab = false;
const measure = element('div', 'line-measure');
measure.setAttribute('aria-hidden', 'true');
document.body.append(measure);
let history = [{ text: '', start: 0, end: 0, top: 0, left: 0 }],
  historyIndex = 0,
  historySize = 0,
  lastTyping = 0;
const freshTable = () => ({
  path: '',
  arrayFilter: '',
  filter: '',
  sort: '',
  direction: 1,
  hidden: new Set(),
  columnsReady: false,
  page: 0,
});
let documents = [{ id: 1, name: 'Document 1', text: '' }],
  activeDocument = 1,
  documentSequence = 1,
  closedDocuments = [],
  mode = 'workspace';
let tableState = freshTable(),
  editContext = null,
  diffTimer,
  diffChanges = [],
  diffIndex = -1,
  queryMatches = null,
  queryPage = 0,
  schemaErrors = [];
const featureJobs = new Map(),
  codeSurfaces = new Map(),
  contextSelections = { path: null, schema: null };
let selectedTreeIndices = [],
  inlineSession = null,
  suppressDiffSyncUntil = 0;
const indent = () => ($('indent').value === 'tab' ? '\t' : ' '.repeat(Number($('indent').value)));
const icon = (name) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'icon');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS(svg.namespaceURI, 'use');
  use.setAttribute('href', '#i-' + name);
  svg.append(use);
  return svg;
};
function element(tag, className, text) {
  const el = document.createElement(tag);
  if (className) el.className = className;
  if (text !== undefined) el.textContent = text;
  return el;
}
function toast(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message;
  $('toast').hidden = false;
  toastTimer = setTimeout(() => ($('toast').hidden = true), 3200);
}
function bytes(size) {
  return size < 1024
    ? size + ' B'
    : size < 1048576
      ? (size / 1024).toFixed(1) + ' KB'
      : (size / 1048576).toFixed(1) + ' MB';
}
function lineAt(position) {
  let low = 0,
    high = lineStarts.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (lineStarts[mid] <= position) low = mid;
    else high = mid - 1;
  }
  return low;
}
function updateCursor() {
  const line = lineAt(source.selectionStart);
  $('cursor-meta').textContent =
    'Ln ' + (line + 1) + ', Col ' + (source.selectionStart - lineStarts[line] + 1);
  renderHighlight();
  if (history[historyIndex].text === source.value)
    Object.assign(history[historyIndex], selection());
}
function syncScroll() {
  renderGutter();
  $('gutter').scrollTop = source.scrollTop;
  const pre = $('source-highlight');
  pre.scrollTop = source.scrollTop;
  pre.scrollLeft = source.scrollLeft;
}
function renderGutter() {
  const gutter = $('gutter'),
    virtual = sourceLines.length > 1000;
  if (!virtual && gutter.dataset.version === String(inputVersion) + layoutKey) return;
  gutter.classList.toggle('virtual', virtual);
  let first = 0,
    last = sourceLines.length;
  if (virtual) {
    let low = 0,
      high = lineTops.length - 1;
    const top = Math.max(0, source.scrollTop - 100);
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (lineTops[mid] <= top) low = mid;
      else high = mid - 1;
    }
    first = low;
    last = first + 1;
    while (
      last < sourceLines.length &&
      lineTops[last] < source.scrollTop + source.clientHeight + 100
    )
      last++;
  }
  const key = inputVersion + layoutKey + ':' + first + ':' + last;
  if (gutter.dataset.window === key) return;
  const frag = document.createDocumentFragment();
  if (virtual) {
    const spacer = element('div');
    spacer.style.height = Math.max(0, gutterHeight - 19 - 60) + 'px';
    frag.append(spacer);
  }
  for (let index = first; index < last; index++) {
    const row = element('div', 'gutter-line', sourceLines[index] || '\u200b');
    row.dataset.line = index + 1;
    if (virtual) row.style.top = lineTops[index] + 'px';
    frag.append(row);
  }
  gutter.replaceChildren(frag);
  gutter.dataset.window = key;
  gutter.dataset.version = String(inputVersion) + layoutKey;
}
function syncGutterSize(force = false) {
  const style = getComputedStyle(source),
    gutter = $('gutter'),
    pre = $('source-highlight');
  const width = Math.max(
    1,
    source.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
  );
  const scrollbar = Math.max(0, source.offsetHeight - source.clientHeight);
  const key = [width, style.font, style.tabSize, $('wrap').checked, scrollbar].join(':');
  gutter.style.setProperty('--source-width', width + 'px');
  gutter.style.setProperty('--source-scrollbar', scrollbar + 'px');
  for (const target of [gutter, pre, measure]) {
    target.style.font = style.font;
    target.style.tabSize = style.tabSize;
    target.style.letterSpacing = style.letterSpacing;
    target.style.wordSpacing = style.wordSpacing;
  }
  pre.style.width = source.clientWidth + 'px';
  pre.style.height = source.clientHeight + 'px';
  if (force || key !== layoutKey) {
    layoutKey = key;
    lineTops = new Array(sourceLines.length);
    const heights = new Map(),
      toMeasure = new Map();
    if ($('wrap').checked) {
      measure.style.width = width + 'px';
      // Short lines cannot wrap. Measure longer distinct lines together in one layout.
      const safeLength = Math.floor(
        width / (parseFloat(style.fontSize) * Math.max(2, Number(style.tabSize) || 2)),
      );
      for (const line of sourceLines)
        if (line.length > safeLength && !toMeasure.has(line))
          toMeasure.set(line, element('div', '', line));
      const frag = document.createDocumentFragment();
      for (const row of toMeasure.values()) frag.append(row);
      measure.replaceChildren(frag);
      for (const [line, row] of toMeasure) heights.set(line, row.getBoundingClientRect().height);
      measure.replaceChildren();
    }
    let top = 19;
    sourceLines.forEach((line, index) => {
      lineTops[index] = top;
      top += heights.get(line) || parseFloat(style.lineHeight);
    });
    gutterHeight = top + 60;
    delete gutter.dataset.window;
    delete gutter.dataset.version;
  }
  renderGutter();
  cancelAnimationFrame(gutterFrame);
  gutterFrame = requestAnimationFrame(syncScroll);
}
function renderHighlight(force = false) {
  const plain = source.value.length > 300000;
  source.parentElement.classList.toggle('plain', plain);
  if (plain) {
    $('source-highlight').replaceChildren();
    return;
  }
  const pos = source.selectionStart,
    pairs = analysis.pairs;
  const at = pairs.has(pos) ? pos : pairs.has(pos - 1) ? pos - 1 : -1;
  const matched =
    source.selectionStart === source.selectionEnd && at !== -1
      ? [at, pairs.get(at)].sort((a, b) => a - b)
      : [];
  const key = matched.join(',');
  if (!force && key === lastPair) return;
  lastPair = key;
  const text = source.value,
    frag = document.createDocumentFragment();
  let offset = 0;
  const tokens = [
    ...analysis.tokens,
    ...matched.map((start) => ({ start, end: start + 1, type: 'bracket-match' })),
  ].sort((a, b) => a.start - b.start);
  for (const token of tokens) {
    frag.append(
      document.createTextNode(text.slice(offset, token.start)),
      element(
        token.type === 'bracket-match' ? 'mark' : 'span',
        token.type,
        text.slice(token.start, token.end),
      ),
    );
    offset = token.end;
  }
  frag.append(document.createTextNode(text.slice(offset) + '\u200b'));
  $('source-highlight').replaceChildren(frag);
  syncScroll();
}
function updateInput() {
  const text = source.value;
  sourceLines = text.split('\n');
  lineStarts = [];
  let offset = 0;
  for (const line of sourceLines) {
    lineStarts.push(offset);
    offset += line.length + 1;
  }
  analysis = EditorCore.analyze(text);
  syncGutterSize(true);
  renderHighlight(true);
  $('source-meta').textContent =
    text.length.toLocaleString() +
    ' characters · ' +
    bytes(new TextEncoder().encode(text).length) +
    (text.length > 300000 ? ' · Plain text' : '');
  updateCursor();
  syncScroll();
  $('copy-source').disabled = !text.length;
  $('clear').disabled = !text.length;
  document.querySelector('[data-action="unescape"]').disabled = !text.length;
}
function selection() {
  return {
    start: source.selectionStart,
    end: source.selectionEnd,
    top: source.scrollTop,
    left: source.scrollLeft,
  };
}
function restoreSelection(state) {
  source.setSelectionRange(state.start, state.end);
  source.scrollTop = state.top;
  source.scrollLeft = state.left;
  updateCursor();
  syncScroll();
}
function captureHistory() {
  if (history[historyIndex].text === source.value)
    Object.assign(history[historyIndex], selection());
}
function updateHistory() {
  $('undo').disabled = historyIndex === 0;
  $('redo').disabled = historyIndex === history.length - 1;
}
function remember(typing = false) {
  const text = source.value;
  if (history[historyIndex].text === text) return;
  const now = Date.now(),
    state = { text, ...selection() };
  if (
    typing &&
    lastTyping &&
    now - lastTyping < 700 &&
    historyIndex === history.length - 1 &&
    historyIndex > 0
  ) {
    historySize += text.length - history[historyIndex].text.length;
    history[historyIndex] = state;
  } else {
    history = history.slice(0, historyIndex + 1);
    history.push(state);
    historyIndex++;
    historySize = history.reduce((sum, item) => sum + item.text.length, 0);
  }
  while ((history.length > 60 || historySize > 10 * 1024 * 1024) && history.length > 2) {
    historySize -= history.shift().text.length;
    historyIndex--;
  }
  lastTyping = typing ? now : 0;
  updateHistory();
}
function changed(reset = true) {
  selectedTreeIndices = [];
  inlineSession = null;
  invalidateFeatures();
  inputVersion++;
  clearTimeout(parseTimer);
  if (reset) {
    overrides.clear();
    limits.clear();
  }
  updateInput();
  parseNow();
}
function setInput(text, message, range) {
  if (text.length > JsonCore.MAX_LENGTH) {
    toast('Input exceeds 2 Mi characters. Your current text is unchanged.');
    return;
  }
  captureHistory();
  source.value = text;
  source.setSelectionRange(range?.start ?? 0, range?.end ?? 0);
  source.scrollTop = range?.top ?? 0;
  source.scrollLeft = range?.left ?? 0;
  remember();
  changed();
  syncScroll();
  if (message) toast(message);
}
function stepHistory(direction) {
  const next = historyIndex + direction;
  if (next < 0 || next >= history.length) return;
  captureHistory();
  historyIndex = next;
  lastTyping = 0;
  const state = { ...history[next] };
  source.value = state.text;
  changed();
  restoreSelection(state);
  updateHistory();
}
function locateSource(start, end) {
  source.focus({ preventScroll: true });
  source.setSelectionRange(start, end);
  const line = lineAt(start);
  source.scrollTop = Math.max(0, lineTops[line] - 75);
  // Measure the exact selected character, including wrapping and horizontal scrolling.
  measure.style.width = $('wrap').checked ? source.clientWidth - 36 + 'px' : 'max-content';
  measure.style.whiteSpace = $('wrap').checked ? 'pre-wrap' : 'pre';
  const prefix = source.value.slice(lineStarts[line], start),
    marker = element('span', '', source.value[start] || '\u200b');
  measure.replaceChildren(
    document.createTextNode(prefix),
    marker,
    document.createTextNode(sourceLines[line].slice(prefix.length + 1)),
  );
  source.scrollTop = Math.max(0, lineTops[line] + marker.offsetTop - 75);
  source.scrollLeft = $('wrap').checked ? 0 : Math.max(0, marker.offsetLeft - 80);
  measure.replaceChildren();
  measure.style.whiteSpace = 'pre-wrap';
  syncScroll();
  updateCursor();
}
function parseNow() {
  clearTimeout(parseTimer);
  parsed = null;
  error = null;
  if (source.value.trim()) {
    try {
      parsed = JsonCore.parse(source.value);
    } catch (err) {
      error = err;
    }
  }
  source.setAttribute('aria-invalid', String(Boolean(error)));
  $('parse-status').className = 'status' + (parsed ? ' valid' : error ? ' invalid' : '');
  $('status-text').textContent = parsed
    ? 'Valid JSON'
    : error
      ? 'Invalid JSON'
      : 'Waiting for input';
  $('output-meta').textContent = parsed
    ? parsed.count.toLocaleString() +
      (parsed.count === 1 ? ' node' : ' nodes') +
      ' · depth ' +
      parsed.depth
    : 'Live parsing';
  ['download', 'copy-output', 'search', 'expand', 'collapse'].forEach(
    (id) => ($(id).disabled = !parsed),
  );
  document.querySelectorAll('[data-action]').forEach((button) => {
    if (!['escape', 'unescape'].includes(button.dataset.action)) button.disabled = !parsed;
  });
  renderOutput();
  if (mode === 'diff') {
    if ($('diff-left').value !== source.value) $('diff-left').value = source.value;
    scheduleDiff();
  }
}
function renderOutput() {
  renderBreadcrumb();
  $('empty-state').hidden = Boolean(parsed || error);
  $('error-state').hidden = !error;
  $('table-panel').hidden = !parsed || view !== 'table';
  $('tree-panel').hidden = !parsed || view !== 'tree';
  $('code-panel').hidden = !parsed || view !== 'code';
  $('tree-controls').hidden = view !== 'tree';
  $('notice').hidden = true;
  $('search-count').hidden = true;
  $('tree').replaceChildren();
  $('formatted').replaceChildren();
  if (error) {
    const position = error.position ?? 0,
      before = source.value.slice(0, position),
      line = before.split('\n').length,
      column = position - before.lastIndexOf('\n');
    $('error-title').textContent = error.message;
    $('error-position').textContent =
      'Line ' + line + ', column ' + column + '. Parsing resumes as you edit.';
    const lineText = source.value.slice(before.lastIndexOf('\n') + 1).split('\n')[0];
    const start = Math.max(0, column - 50);
    $('error-context').textContent =
      (start ? '…' : '') +
      lineText.slice(start, start + 110) +
      '\n' +
      ' '.repeat(Math.max(0, column - 1 - start) + (start ? 1 : 0)) +
      '^';
    return;
  }
  if (!parsed) return;
  if (parsed.duplicateKeys)
    showNotice(
      parsed.duplicateKeys +
        (parsed.duplicateKeys === 1 ? ' duplicate key' : ' duplicate keys') +
        ' preserved in the original order. Other JSON tools may keep only the last value.',
    );
  const query = $('search').value.trim().toLowerCase();
  if (view === 'tree') renderTree(query);
  else if (view === 'table') renderTable(query);
  else renderCode(query);
}
function showNotice(message) {
  $('notice').textContent = $('notice').hidden ? message : $('notice').textContent + ' ' + message;
  $('notice').hidden = false;
}
function renderTree(query) {
  const matches = new Set(),
    included = new Set();
  let totalMatches = 0,
    rows = 0,
    truncated = false;
  function scan(node, key, id) {
    const own =
      query &&
      ((key === undefined ? '$' : String(key)).toLowerCase().includes(query) ||
        (!node.children &&
          (node.type === 'string' ? node.value : node.raw).toLowerCase().includes(query)));
    let descendant = false;
    if (node.children)
      node.children.forEach((entry, i) => {
        if (scan(entry.node, node.type === 'object' ? entry.key : i, id + '/' + i))
          descendant = true;
      });
    if (own) {
      matches.add(id);
      totalMatches++;
    }
    if (own || descendant) included.add(id);
    return own || descendant;
  }
  if (query) scan(parsed.root, undefined, 'root');
  const frag = document.createDocumentFragment();
  function add(node, key, id, level, path, inherited = false) {
    if (query && !inherited && !included.has(id)) return;
    if (rows >= 2500) {
      truncated = true;
      return;
    }
    rows++;
    const row = element('div', 'tree-row' + (matches.has(id) ? ' selected' : ''));
    row.style.paddingLeft = level * 20 + 'px';
    row.style.setProperty('--guide-width', level * 20 + 'px');
    const container = Boolean(node.children),
      open = overrides.has(id) ? overrides.get(id) : query ? true : level < expansionDepth;
    const expanded = container && open && node.children.length > 0;
    if (container && node.children.length) {
      const toggle = element('button', 'tree-toggle');
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(open));
      toggle.setAttribute('aria-label', (open ? 'Collapse ' : 'Expand ') + path);
      toggle.append(icon('chevron'));
      toggle.onclick = () => {
        overrides.set(id, !open);
        const scroll = $('output').scrollTop;
        renderOutput();
        const replacement = [...$('tree').querySelectorAll('.tree-toggle')].find(
          (item) => item.dataset.node === id,
        );
        replacement?.focus({ preventScroll: true });
        $('output').scrollTop = scroll;
      };
      toggle.dataset.node = id;
      row.append(toggle);
    } else row.append(element('span', 'tree-spacer'));
    const label = element('button', 'node-label');
    label.type = 'button';
    label.setAttribute('aria-label', 'Locate ' + path);
    label.title = 'Click to locate · Double-click or F2 to edit';
    label.onclick = () => {
      selectTree(indices, path);
      locateSource(node.start, node.end);
    };
    label.ondblclick = () => beginInlineEdit(row, label, node, indices, path);
    label.onkeydown = (event) => {
      if (event.key === 'F2') {
        event.preventDefault();
        beginInlineEdit(row, label, node, indices, path);
      }
    };
    label.append(
      element(
        'span',
        'tree-key',
        key === undefined ? '$' : typeof key === 'number' ? String(key) : JSON.stringify(key),
      ),
    );
    label.append(element('span', 'tree-colon', ':'));
    if (container) {
      const object = node.type === 'object';
      const summary = expanded
        ? object
          ? '{'
          : '['
        : (object ? '{' : '[') + (node.children.length ? ' … ' : '') + (object ? '}' : ']');
      label.append(element('span', 'tree-value', summary));
      label.append(
        element(
          'span',
          'tree-count',
          node.children.length +
            (object ? ' key' : ' item') +
            (node.children.length === 1 ? '' : 's'),
        ),
      );
    } else {
      const full = JsonCore.primitive(node);
      const value = element(
        'span',
        'tree-value type-' + node.type,
        full.length > 500 ? full.slice(0, 500) + '…' : full,
      );
      value.title = full.length > 500 ? full.slice(0, 3000) : '';
      label.append(value);
    }
    row.append(label);
    const indices = id.split('/').slice(1).map(Number),
      edit = element('button', 'node-path node-edit', 'Edit');
    edit.setAttribute('aria-label', 'Edit ' + path);
    edit.onclick = () => openNodeEditor(indices, path);
    row.append(edit);
    row.dataset.indices = indices.join('/');
    row.classList.toggle('selected-node', row.dataset.indices === selectedTreeIndices.join('/'));
    row.addEventListener('focusin', () => selectTree(indices, path));
    if (node.children) {
      const add = element('button', 'node-path node-edit', '+');
      add.setAttribute('aria-label', 'Add child ' + path);
      add.onclick = () => openNodeEditor(indices, path, 'add');
      row.append(add);
    }
    if (indices.length) {
      const remove = element('button', 'node-path node-edit', '−');
      remove.setAttribute('aria-label', 'Delete node ' + path);
      remove.onclick = () => openNodeEditor(indices, path, 'remove');
      row.append(remove);
    }
    if (node.type === 'string') {
      try {
        JsonCore.parse(node.value);
        const decode = element('button', 'node-path node-edit', 'Parse JSON');
        decode.setAttribute('aria-label', 'Parse nested JSON ' + path);
        decode.onclick = () => openNodeEditor(indices, path, 'decode');
        row.append(decode);
      } catch {}
    }

    const valueButton = element('button', 'node-path node-copy');
    valueButton.type = 'button';
    valueButton.append(icon('copy'));
    valueButton.title = 'Copy JSON value';
    valueButton.setAttribute('aria-label', 'Copy value ' + path);
    valueButton.onclick = () => copy(JsonCore.stringify(node, indent()), 'JSON value copied');
    row.append(valueButton);
    const pathButton = element('button', 'node-path', '↗');
    pathButton.type = 'button';
    pathButton.title = 'Copy path: ' + path;
    pathButton.setAttribute('aria-label', 'Copy path ' + path);
    pathButton.onclick = () => copy(path, 'Path copied');
    row.append(pathButton);
    frag.append(row);
    if (!expanded) return;
    let visible = 0,
      remaining = 0;
    const limit = limits.get(id) || 100,
      showChildren = inherited || matches.has(id);
    node.children.forEach((entry, i) => {
      const childId = id + '/' + i;
      if (query && !showChildren && !included.has(childId)) return;
      if (visible++ >= limit) {
        remaining++;
        return;
      }
      const childKey = node.type === 'object' ? entry.key : i;
      const childPath =
        node.type === 'object'
          ? path + '[' + JSON.stringify(entry.key) + ']'
          : path + '[' + i + ']';
      add(entry.node, childKey, childId, level + 1, childPath, showChildren);
    });
    if (remaining && rows < 2500) {
      const more = element(
        'button',
        'tree-more',
        'Show ' + Math.min(100, remaining) + ' more · ' + remaining + ' remaining',
      );
      more.style.marginLeft = (level + 1) * 20 + 22 + 'px';
      more.onclick = () => {
        limits.set(id, limit + 100);
        renderOutput();
      };
      frag.append(more);
    }
    const closing = element('div', 'tree-row tree-closing');
    closing.style.paddingLeft = level * 20 + 'px';
    closing.style.setProperty('--guide-width', level * 20 + 'px');
    closing.append(
      element('span', 'tree-spacer'),
      element('span', 'tree-value', node.type === 'object' ? '}' : ']'),
    );
    frag.append(closing);
  }
  add(parsed.root, undefined, 'root', 0, '$');
  if (query && !totalMatches) frag.append(element('div', 'blank', 'No matching keys or values'));
  if (query) {
    $('search-count').hidden = false;
    $('search-count').textContent = totalMatches + (totalMatches === 1 ? ' match' : ' matches');
    $('tree-controls').hidden = true;
  }
  if (truncated)
    showNotice(
      'Showing up to 2,500 rows. Collapse nodes or search to narrow the view. Copy and download include all data.',
    );
  $('tree').append(frag);
}
function renderCode(query) {
  const text = JsonCore.stringify(parsed.root, indent()),
    pre = $('formatted');
  if (text.length > 300000) {
    pre.textContent = text;
    showNotice(
      'Large output is displayed as plain text. Use the tree view to search keys or values.',
    );
    return;
  }
  const tokens =
    /"(?:\\[\s\S]|[^"\\])*"\s*:|"(?:\\[\s\S]|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b/g;
  let last = 0,
    match,
    count = 0;
  function appendText(parent, content) {
    if (!query) {
      parent.append(document.createTextNode(content));
      return;
    }
    const lower = content.toLowerCase();
    let from = 0,
      at;
    while ((at = lower.indexOf(query, from)) !== -1) {
      parent.append(
        document.createTextNode(content.slice(from, at)),
        element('mark', 'match', content.slice(at, at + query.length)),
      );
      from = at + query.length;
      count++;
    }
    parent.append(document.createTextNode(content.slice(from)));
  }
  while ((match = tokens.exec(text))) {
    appendText(pre, text.slice(last, match.index));
    const token = match[0],
      type = token.startsWith('"')
        ? token.trimEnd().endsWith(':')
          ? 'token-key'
          : 'type-string'
        : token === 'null'
          ? 'type-null'
          : /^(true|false)$/.test(token)
            ? 'type-boolean'
            : 'type-number';
    const span = element('span', type);
    appendText(span, token);
    pre.append(span);
    last = tokens.lastIndex;
  }
  appendText(pre, text.slice(last));
  if (query) {
    $('search-count').hidden = false;
    $('search-count').textContent = count + (count === 1 ? ' match' : ' matches');
  }
}
function switchView(next, focus = false) {
  view = next;
  ['tree', 'code', 'table'].forEach((item) => {
    $(item + '-tab').setAttribute('aria-selected', String(next === item));
    $(item + '-tab').tabIndex = next === item ? 0 : -1;
  });
  if (focus) $(next + '-tab').focus();
  renderOutput();
}
async function copy(text, message = 'Copied') {
  try {
    if (!navigator.clipboard?.writeText) throw new Error('fallback');
    await navigator.clipboard.writeText(text);
  } catch {
    const active = document.activeElement,
      start = source.selectionStart,
      end = source.selectionEnd;
    const temp = element('textarea');
    temp.value = text;
    temp.style.cssText = 'position:fixed;left:-10000px;top:0';
    document.body.append(temp);
    temp.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      /* Show a useful fallback below. */
    }
    temp.remove();
    active?.focus({ preventScroll: true });
    source.setSelectionRange(start, end);
    if (!ok) {
      toast('Clipboard access is unavailable. Select the text and press ⌘ / Ctrl + C.');
      return;
    }
  }
  toast(message);
}
const labels = {
  format: 'JSON formatted',
  compact: 'JSON minified',
  escape: 'Escaped as a JSON string',
  unescape: 'One escape layer removed',
  sort: 'Object keys sorted',
  reverse: 'Arrays reversed',
  unicode: 'Unicode escaped',
  'unicode-decode': 'Unicode decoded',
};
function run(action) {
  $('more-tools').open = false;
  try {
    setInput(JsonCore.transform(source.value, action, indent()), labels[action]);
  } catch (err) {
    toast(err.message);
    parseNow();
  }
}
async function importFile(file) {
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    toast('File exceeds 2 MB. Split it before importing.');
    return;
  }
  const version = inputVersion,
    sequence = ++importSequence;
  try {
    const text = (await file.text()).replace(/^\uFEFF/, '');
    if (sequence !== importSequence) return;
    if (version !== inputVersion) {
      toast('Your input changed while reading the file. Import again to replace it.');
      return;
    }
    setInput(text, 'Imported ' + file.name);
  } catch {
    toast('Could not read the file. Please try again.');
  }
}
source.addEventListener('beforeinput', (event) => {
  if (event.inputType === 'historyUndo' || event.inputType === 'historyRedo') {
    event.preventDefault();
    stepHistory(event.inputType === 'historyUndo' ? -1 : 1);
    return;
  }
  captureHistory();
});
source.addEventListener('input', (event) => {
  if (source.value.length > JsonCore.MAX_LENGTH) {
    const state = { ...history[historyIndex] };
    source.value = state.text;
    changed();
    restoreSelection(state);
    toast('Input exceeds 2 Mi characters. Your current text is unchanged.');
    return;
  }
  invalidateFeatures();
  inputVersion++;
  remember(
    event.inputType === 'insertText' ||
      event.inputType === 'deleteContentBackward' ||
      event.isComposing,
  );
  updateInput();
  overrides.clear();
  limits.clear();
  clearTimeout(parseTimer);
  parsed = null;
  error = null;
  $('status-text').textContent = 'Parsing…';
  $('parse-status').className = 'status';
  $('tree-panel').hidden = true;
  $('code-panel').hidden = true;
  $('table-panel').hidden = true;
  $('notice').hidden = true;
  $('error-state').hidden = true;
  ['download', 'copy-output', 'search', 'expand', 'collapse'].forEach(
    (id) => ($(id).disabled = true),
  );
  parseTimer = setTimeout(parseNow, event.isComposing ? 300 : 140);
});
source.addEventListener('scroll', syncScroll);
['click', 'keyup', 'select'].forEach((name) => source.addEventListener(name, updateCursor));
source.addEventListener('keydown', (event) => {
  if (event.isComposing) return;
  if (event.key === 'Escape') {
    releaseTab = true;
    lastTyping = 0;
    return;
  }
  if (event.key === 'Tab' && releaseTab) {
    releaseTab = false;
    return;
  }
  releaseTab = false;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))
    lastTyping = 0;
  if (event.key === 'Tab' && !event.ctrlKey && !event.metaKey && !event.altKey) {
    event.preventDefault();
    const edit = EditorCore.indentSelection(
      source.value,
      source.selectionStart,
      source.selectionEnd,
      indent(),
      event.shiftKey,
    );
    setInput(edit.text, undefined, { ...selection(), start: edit.start, end: edit.end });
  }
});
source.addEventListener('pointerdown', () => {
  lastTyping = 0;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('more-tools').open) {
    if ($('more-tools').contains(document.activeElement)) {
      $('more-tools').querySelector('summary').focus();
    }
    $('more-tools').open = false;
  }
  if (event.isComposing || !(event.metaKey || event.ctrlKey) || event.altKey) return;
  if (event.key === 'Enter') {
    event.preventDefault();
    if (mode === 'schema') runSchema();
    else if (mode === 'path') runQuery();
    else if (mode === 'diff') runDiff();
    else if (!document.querySelector('dialog[open]')) run('format');
  }
  const editingOther =
    ['INPUT', 'TEXTAREA'].includes(event.target.tagName) && event.target !== source;
  if (!editingOther && event.key.toLowerCase() === 'z') {
    event.preventDefault();
    stepHistory(event.shiftKey ? 1 : -1);
  }
  if (!editingOther && event.key.toLowerCase() === 'y') {
    event.preventDefault();
    stepHistory(1);
  }
});
document
  .querySelectorAll('[data-action]')
  .forEach((button) => (button.onclick = () => run(button.dataset.action)));
document.addEventListener('click', (event) => {
  if (!$('more-tools').contains(event.target)) $('more-tools').open = false;
});
$('undo').onclick = () => stepHistory(-1);
$('redo').onclick = () => stepHistory(1);
$('sample').onclick = $('empty-sample').onclick = () => {
  setInput(sample, 'Sample loaded');
};
$('clear').onclick = () => {
  setInput('', 'Cleared. Undo to restore.');
  $('search').value = '';
  source.focus();
};
$('wrap').onchange = () => {
  source.classList.toggle('wrap', $('wrap').checked);
  $('editor').classList.toggle('wrap', $('wrap').checked);
  source.wrap = $('wrap').checked ? 'soft' : 'off';
  syncGutterSize();
};
$('indent').onchange = () => {
  source.style.tabSize = $('indent').value === '4' ? 4 : 2;
  syncGutterSize();
  renderOutput();
};
$('tree-tab').onclick = () => switchView('tree');
$('code-tab').onclick = () => switchView('code');
document.querySelector('.tabs').onkeydown = (event) => {
  if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
    event.preventDefault();
    const views = ['tree', 'code', 'table'];
    switchView(
      event.key === 'Home'
        ? 'tree'
        : event.key === 'End'
          ? 'table'
          : views[(views.indexOf(view) + (event.key === 'ArrowRight' ? 1 : 2)) % 3],
      true,
    );
  }
};
$('expand').onclick = () => {
  expansionDepth = 129;
  overrides.clear();
  renderOutput();
};
$('collapse').onclick = () => {
  expansionDepth = 0;
  overrides.clear();
  renderOutput();
};
$('search').oninput = () => {
  clearTimeout(searchTimer);
  overrides.clear();
  limits.clear();
  searchTimer = setTimeout(renderOutput, 120);
};
$('copy-source').onclick = () => copy(source.value, 'Input copied');
$('copy-output').onclick = () => {
  parseNow();
  if (parsed) copy(JsonCore.stringify(parsed.root, indent()), 'Complete JSON copied');
};
$('locate-error').onclick = () => {
  const pos = error?.position ?? 0;
  locateSource(pos, Math.min(pos + 1, source.value.length));
};
$('import-button').onclick = () => $('file-input').click();
$('file-input').onchange = (event) => {
  importFile(event.target.files[0]);
  event.target.value = '';
};
let dragDepth = 0;
$('editor').addEventListener('dragenter', (event) => {
  event.preventDefault();
  dragDepth++;
  $('editor').classList.add('dragging');
});
$('editor').addEventListener('dragover', (event) => event.preventDefault());
$('editor').addEventListener('dragleave', () => {
  if (--dragDepth <= 0) $('editor').classList.remove('dragging');
});
$('editor').addEventListener('drop', (event) => {
  event.preventDefault();
  dragDepth = 0;
  $('editor').classList.remove('dragging');
  if (event.dataTransfer.files.length) importFile(event.dataTransfer.files[0]);
  else if (event.dataTransfer.getData('text/plain'))
    setInput(event.dataTransfer.getData('text/plain'));
});
// Prevent drops outside the editor from navigating away and losing work.
document.addEventListener('dragover', (event) => {
  if ([...event.dataTransfer.types].includes('Files')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  if (event.dataTransfer.files.length) event.preventDefault();
});
$('download').onclick = () => {
  parseNow();
  if (!parsed) return;
  downloadText(JsonCore.stringify(parsed.root, indent()) + '\n', 'document.json');
};
window.addEventListener('beforeunload', (event) => {
  saveDocument();
  if (documents.some((doc) => (doc.text && doc.text !== sample) || doc.diff || doc.schema)) {
    event.preventDefault();
    event.returnValue = '';
  }
});
function featureStatus(id, text, bad = false) {
  $(id).textContent = text;
  $(id).classList.toggle('error', bad);
}
function downloadText(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json;charset=utf-8' })),
    link = element('a');
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
  toast('Download requested: ' + name);
}
function cancelJobs() {
  for (const job of featureJobs.values()) {
    clearTimeout(job.timer);
    job.worker.terminate();
  }
  featureJobs.clear();
}
function invalidateFeatures() {
  for (const kind of ['path', 'schema']) {
    contextSelections[kind] = null;
    $(kind + '-location').textContent = 'Active document';
    $(kind + '-location').title = 'Active document';
    const surface = codeSurfaces.get(kind + '-preview');
    if (surface) {
      surface.ranges = [];
      surface.active = null;
    }
    if (mode === kind) refreshContext(kind, true);
  }
  cancelJobs();
  clearTimeout(diffTimer);
  queryMatches = null;
  schemaErrors = [];
  diffChanges = [];
  diffIndex = -1;
  $('copy-query').disabled = $('export-query').disabled = true;
  $('diff-next').disabled = $('diff-previous').disabled = true;
  $('diff-position').textContent = '0 / 0';
  for (const id of ['diff-results', 'query-results', 'schema-results']) $(id).replaceChildren();
  featureStatus('query-status', 'Run a query against the active document.');
  featureStatus('schema-status', 'Select Validate to check the active document.');
  refreshDiffPaint();
}
function job(kind, payload, callback, statusId) {
  const old = featureJobs.get(kind);
  if (old) {
    clearTimeout(old.timer);
    old.worker.terminate();
  }
  let worker;
  try {
    worker = new Worker(new URL('./analysis-worker.js', import.meta.url), { type: 'module' });
  } catch {
    featureStatus(statusId, 'This browser could not start the local analysis worker.', true);
    return;
  }
  const version = inputVersion,
    documentId = activeDocument;
  const finish = () => {
    clearTimeout(timer);
    worker.terminate();
    if (featureJobs.get(kind)?.worker === worker) featureJobs.delete(kind);
  };
  const timer = setTimeout(() => {
    finish();
    featureStatus(
      statusId,
      'Analysis exceeded 3 seconds. Reduce the data, pattern or query complexity.',
      true,
    );
  }, 3000);
  featureJobs.set(kind, { worker, timer });
  worker.onmessage = (event) => {
    if (featureJobs.get(kind)?.worker !== worker) return;
    finish();
    if (version !== inputVersion || documentId !== activeDocument) return;
    if (event.data.error) featureStatus(statusId, event.data.error, true);
    else callback(event.data.result);
  };
  worker.onerror = () => {
    if (featureJobs.get(kind)?.worker !== worker) return;
    finish();
    featureStatus(statusId, 'Analysis failed. Review the input and try again.', true);
  };
  worker.postMessage({ kind, payload });
}
function setMode(next) {
  mode = next;
  $('more-tools').open = false;
  document.querySelector('.panes').hidden = mode !== 'workspace';
  $('mode-caption').hidden = mode === 'workspace';
  if (mode === 'path' || mode === 'schema') refreshContext(mode);
  for (const name of ['diff', 'path', 'schema']) $(name + '-mode').hidden = mode !== name;
  document.querySelectorAll('[data-mode]').forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('mode-caption').textContent = {
    workspace: 'Explore and edit the active document',
    diff: 'Compare JSON by structure · arrays match by index',
    path: 'Extract values from the active document',
    schema: 'Validate the active document',
  }[mode];
  if (mode === 'diff') {
    $('diff-left').value = source.value;
    refreshDiffDocuments();
    refreshDiffPaint();
    scheduleDiff();
  }
  if (mode === 'workspace') {
    syncGutterSize(true);
    renderOutput();
  }
}
function refreshDiffDocuments() {
  const selected = $('diff-document').value;
  const options = [element('option', '', 'Pasted JSON')];
  options[0].value = '';
  for (const doc of documents)
    if (doc.id !== activeDocument) {
      const option = element('option', '', doc.name);
      option.value = doc.id;
      options.push(option);
    }
  $('diff-document').replaceChildren(...options);
  $('diff-document').value = selected;
}
function saveDocument() {
  captureHistory();
  const doc = documents.find((item) => item.id === activeDocument);
  if (!doc) return;
  Object.assign(doc, {
    text: source.value,
    history,
    historyIndex,
    historySize,
    selection: selection(),
    view,
    search: $('search').value,
    wrap: $('wrap').checked,
    indent: $('indent').value,
    expansionDepth,
    overrides,
    limits,
    diff: $('diff-right').value,
    ignoreOrder: $('diff-ignore-order').checked,
    expression: $('path-expression').value,
    schema: $('schema-source').value,
    tableState,
  });
}
function renderDocuments() {
  const frag = document.createDocumentFragment();
  for (const doc of documents) {
    const group = element('div', 'document-item'),
      button = element('button', 'document-tab', doc.name);
    button.type = 'button';
    button.setAttribute('role', 'tab');
    button.setAttribute('aria-selected', String(doc.id === activeDocument));
    button.tabIndex = doc.id === activeDocument ? 0 : -1;
    button.title = doc.name;
    button.onclick = () => activateDocument(doc.id);
    const close = element('button', 'icon-button document-close', '×');
    close.setAttribute('aria-label', 'Close ' + doc.name);
    close.onclick = () => closeDocument(doc.id);
    group.append(button, close);
    frag.append(group);
  }
  $('document-tabs').replaceChildren(frag);
  $('reopen-document').disabled = !closedDocuments.length;
  $('new-document').disabled = $('duplicate-document').disabled = documents.length >= 12;
  refreshDiffDocuments();
}
function activateDocument(id) {
  if (id === activeDocument) return;
  saveDocument();
  cancelJobs();
  clearTimeout(parseTimer);
  importSequence++;
  activeDocument = id;
  const doc = documents.find((item) => item.id === id);
  history = doc.history || [{ text: doc.text || '', start: 0, end: 0, top: 0, left: 0 }];
  historyIndex = doc.historyIndex || 0;
  historySize = doc.historySize || 0;
  lastTyping = 0;
  source.value = doc.text || '';
  view = doc.view || 'tree';
  $('search').value = doc.search || '';
  $('indent').value = doc.indent || '2';
  source.style.tabSize = doc.indent === '4' ? 4 : 2;
  $('wrap').checked = Boolean(doc.wrap);
  source.wrap = doc.wrap ? 'soft' : 'off';
  source.classList.toggle('wrap', Boolean(doc.wrap));
  $('editor').classList.toggle('wrap', Boolean(doc.wrap));
  expansionDepth = doc.expansionDepth ?? 2;
  overrides = doc.overrides || new Map();
  limits = doc.limits || new Map();
  tableState = doc.tableState || freshTable();
  $('diff-right').value = doc.diff || '';
  $('diff-ignore-order').checked = doc.ignoreOrder !== false;
  $('path-expression').value = doc.expression || '$';
  $('schema-source').value = doc.schema || '';
  const range = doc.selection || { start: 0, end: 0, top: 0, left: 0 };
  changed(false);
  restoreSelection(range);
  updateHistory();
  switchView(view);
  renderDocuments();
  setMode(mode);
}
function addDocument(text = '', name) {
  if (documents.length >= 12) {
    toast('Up to 12 documents can be open. Close a tab first.');
    return;
  }
  const id = ++documentSequence;
  documents.push({ id, name: name || 'Document ' + id, text });
  activateDocument(id);
}
function closeDocument(id) {
  saveDocument();
  const index = documents.findIndex((doc) => doc.id === id),
    doc = documents[index];
  closedDocuments.push(doc);
  if (closedDocuments.length > 5) closedDocuments.shift();
  if (documents.length === 1) {
    documents.push({ id: ++documentSequence, name: 'Document ' + documentSequence, text: '' });
  }
  if (id === activeDocument) activateDocument(documents[index ? index - 1 : index + 1].id);
  documents = documents.filter((item) => item.id !== id);
  renderDocuments();
}
function scheduleDiff() {
  clearTimeout(diffTimer);
  const pending = featureJobs.get('diff');
  if (pending) {
    clearTimeout(pending.timer);
    pending.worker.terminate();
    featureJobs.delete('diff');
  }
  if (mode === 'diff') diffTimer = setTimeout(runDiff, 180);
}
function runDiff() {
  clearTimeout(diffTimer);
  diffChanges = [];
  diffIndex = -1;
  $('diff-results').replaceChildren();
  refreshDiffPaint();
  $('diff-next').disabled = $('diff-previous').disabled = true;
  $('diff-position').textContent = '0 / 0';
  if (!source.value.trim() || !$('diff-right').value.trim()) {
    featureStatus('diff-status', 'Paste two documents to compare.');
    return;
  }
  for (const [label, text] of [
    ['Before', source.value],
    ['After', $('diff-right').value],
  ])
    try {
      JsonCore.parse(text);
    } catch (err) {
      featureStatus('diff-status', label + ': ' + err.message, true);
      return;
    }
  featureStatus('diff-status', 'Comparing…');
  job(
    'diff',
    {
      text: source.value,
      after: $('diff-right').value,
      ignoreOrder: $('diff-ignore-order').checked,
    },
    (changes) => {
      diffChanges = changes;
      diffIndex = changes.length ? 0 : -1;
      const counts = { added: 0, removed: 0, modified: 0, reordered: 0 };
      changes.forEach((change) => counts[change.kind]++);
      featureStatus(
        'diff-status',
        changes.length
          ? changes.length +
              ' differences · ' +
              counts.added +
              ' added · ' +
              counts.removed +
              ' removed · ' +
              (counts.modified + counts.reordered) +
              ' modified'
          : 'Documents are structurally equal.',
      );
      renderDiff();
    },
    'diff-status',
  );
}
const preview = (node) =>
  node
    ? ((text) => (text.length > 300 ? text.slice(0, 300) + '…' : text))(
        JsonCore.stringify(node, ''),
      )
    : '—';
function renderDiff() {
  const frag = document.createDocumentFragment(),
    start = Math.max(0, Math.floor(diffIndex / 100) * 100);
  diffChanges.slice(start, start + 100).forEach((change, offset) => {
    const index = start + offset,
      row = element(
        'button',
        'result-row kind-' + change.kind + (index === diffIndex ? ' current' : ''),
      );
    row.type = 'button';
    row.setAttribute(
      'aria-label',
      'Difference ' + (index + 1) + ' ' + change.kind + ' ' + change.path,
    );
    const path = element('span', '', change.path);
    path.title = change.path;
    row.append(
      element('span', 'change-' + change.kind, change.kind),
      path,
      element('span', '', preview(change.before)),
      element('span', '', preview(change.after)),
    );
    row.onclick = () => jumpDiff(index);
    frag.append(row);
  });
  $('diff-results').replaceChildren(frag);
  $('diff-next').disabled = $('diff-previous').disabled = !diffChanges.length;
  $('diff-position').textContent = diffIndex + 1 + ' / ' + diffChanges.length;
  refreshDiffPaint();
}
function selectIn(area, node) {
  if (!node) {
    area.setSelectionRange(0, 0);
    return;
  }
  area.focus({ preventScroll: true });
  area.setSelectionRange(node.start, node.end);
  const before = area.value.slice(0, node.start),
    line = before.split('\n').length,
    height = parseFloat(getComputedStyle(area).lineHeight);
  area.scrollTop = Math.max(0, (line - 2) * height);
  const prefix = before.slice(before.lastIndexOf('\n') + 1);
  area.scrollLeft = Math.max(
    0,
    prefix.length * parseFloat(getComputedStyle(area).fontSize) * 0.6 - 60,
  );
  codeSurfaces.get(area.id)?.draw();
}
function jumpDiff(index) {
  if (!diffChanges.length) return;
  suppressDiffSyncUntil = performance.now() + 100;
  diffIndex = (index + diffChanges.length) % diffChanges.length;
  const change = diffChanges[diffIndex];
  renderDiff();
  selectIn($('diff-left'), change.before);
  selectIn($('diff-right'), change.after);
  $('diff-results').querySelector('.current')?.scrollIntoView({ block: 'nearest' });
}
function queryJSON() {
  return JsonCore.stringify(
    { type: 'array', children: queryMatches.map((ref) => ({ node: ref.node })) },
    indent(),
  );
}
function runQuery() {
  queryMatches = null;
  $('copy-query').disabled = $('export-query').disabled = true;
  $('query-results').replaceChildren();
  featureStatus('query-status', 'Querying…');
  job(
    'path',
    { text: source.value, expression: $('path-expression').value },
    (matches) => {
      queryMatches = matches;
      queryPage = 0;
      $('copy-query').disabled = $('export-query').disabled = false;
      featureStatus(
        'query-status',
        matches.length + ' results · click a path to locate its source',
      );
      renderQuery();
    },
    'query-status',
  );
}
function pager(parent, page, total, change) {
  const bar = element('div', 'pager'),
    previous = element('button', 'text-button', '← Previous'),
    next = element('button', 'text-button', 'Next →');
  previous.disabled = page === 0;
  next.disabled = (page + 1) * 100 >= total;
  previous.onclick = () => change(page - 1);
  next.onclick = () => change(page + 1);
  bar.append(
    previous,
    element(
      'span',
      '',
      total
        ? Math.min(total, page * 100 + 1) + '–' + Math.min(total, (page + 1) * 100) + ' of ' + total
        : '0 results',
    ),
    next,
  );
  parent.append(bar);
}
function renderQuery() {
  const frag = document.createDocumentFragment();
  for (const ref of queryMatches.slice(queryPage * 100, (queryPage + 1) * 100)) {
    const row = element('div', 'result-row query-row'),
      locate = element('button', 'text-button', ref.path),
      value = element('span', '', preview(ref.node)),
      copyButton = element('button', 'text-button', 'Copy');
    locate.setAttribute('aria-label', 'Locate query result ' + ref.path);
    locate.title = ref.path;
    locate.onclick = () => showContext('path', ref.node, ref.path);
    copyButton.setAttribute('aria-label', 'Copy query result ' + ref.path);
    copyButton.onclick = () => copy(JsonCore.stringify(ref.node, indent()), 'JSON value copied');
    row.append(locate, value, copyButton);
    frag.append(row);
  }
  pager(frag, queryPage, queryMatches.length, (page) => {
    queryPage = page;
    renderQuery();
  });
  $('query-results').replaceChildren(frag);
}
function runSchema() {
  $('schema-results').replaceChildren();
  featureStatus('schema-status', 'Validating…');
  job(
    'schema',
    { text: source.value, schema: $('schema-source').value },
    (result) => {
      schemaErrors = result.errors;
      featureStatus(
        'schema-status',
        schemaErrors.length
          ? (result.truncated
              ? 'First 200 validation errors'
              : schemaErrors.length + ' validation errors') +
              ' · click an error to locate its source'
          : 'Valid against this schema.',
        Boolean(schemaErrors.length),
      );
      const frag = document.createDocumentFragment();
      for (const error of schemaErrors) {
        const row = element('button', 'result-row schema-row');
        row.setAttribute('aria-label', 'Schema error ' + error.path + ' ' + error.message);
        row.append(
          element('span', '', error.path),
          element('span', '', error.message),
          element('span', '', 'Locate →'),
        );
        row.firstElementChild.title = error.path;
        row.onclick = () => showContext('schema', error.node, error.path);
        frag.append(row);
      }
      $('schema-results').replaceChildren(frag);
    },
    'schema-status',
  );
}
function openNodeEditor(indices, path, action = 'replace') {
  if (!parsed) return;
  editContext = { indices, path, version: inputVersion, documentId: activeDocument };
  const node = StudioCore.getNode(parsed.root, indices),
    parent = indices.length ? StudioCore.getNode(parsed.root, indices.slice(0, -1)) : null;
  $('edit-path').textContent = path;
  $('edit-value').value = JsonCore.stringify(node, indent());
  $('edit-key').value = parent?.type === 'object' ? parent.children[indices.at(-1)].key : '';
  $('edit-index').value = node.children?.length || 0;
  $('edit-error').textContent = '';
  for (const option of $('edit-action').options)
    option.disabled =
      option.value === 'rename'
        ? parent?.type !== 'object'
        : option.value === 'remove'
          ? !parent
          : option.value === 'add'
            ? !node.children
            : option.value === 'decode'
              ? node.type !== 'string'
              : false;
  $('edit-action').value = action;
  updateEditFields();
  $('edit-dialog').showModal();
}
function updateEditFields() {
  const action = $('edit-action').value,
    node = StudioCore.getNode(parsed.root, editContext.indices);
  $('edit-key-label').hidden = !(
    action === 'rename' ||
    (action === 'add' && node.type === 'object')
  );
  $('edit-index-label').hidden = !(action === 'add' && node.type === 'array');
  $('edit-value-label').hidden = !['replace', 'add'].includes(action);
  $('edit-hint').textContent = {
    replace: 'Enter any valid JSON value. Strings need double quotes.',
    rename: 'The property value stays unchanged.',
    add: 'Add a property or insert an array item at the chosen position.',
    remove: 'Delete this node and its children. Undo restores the change.',
    decode: 'Parse one JSON string layer. Exact numeric text is preserved.',
    encode: 'Encode this value as a compact JSON string. Undo restores its original form.',
  }[action];
}
function applyNodeEdit(event) {
  event.preventDefault();
  if (editContext.documentId !== activeDocument || editContext.version !== inputVersion) {
    $('edit-error').textContent =
      'The document changed. Close this dialog and select the node again.';
    return;
  }
  try {
    const next = StudioCore.modify(parsed.root, editContext.indices, $('edit-action').value, {
      value: $('edit-value').value,
      key: $('edit-key').value,
      index: $('edit-index').value,
    });
    const text = JsonCore.stringify(next, indent());
    JsonCore.parse(text);
    setInput(text, 'Node updated. Undo to restore.');
    $('edit-dialog').close();
  } catch (err) {
    $('edit-error').textContent = err.message;
  }
}
function arraysIn(root) {
  const out = [];
  function scan(ref) {
    if (ref.node.type === 'array') out.push(ref);
    for (const child of StudioCore.children(ref)) scan(child);
  }
  scan(StudioCore.rootRef(root));
  return out;
}
function renderTable(query) {
  const host = $('table-panel');
  host.replaceChildren();
  const arrays = arraysIn(parsed.root);
  if (!arrays.length) {
    host.append(
      element('div', 'blank', 'No arrays in this document. Select an array to use the table view.'),
    );
    return;
  }
  let selected = arrays.find((ref) => ref.indices.join('/') === tableState.path) || arrays[0];
  tableState.path = selected.indices.join('/');
  const tools = element('div', 'table-tools'),
    select = element('select');
  select.setAttribute('aria-label', 'Table array');
  const arraySearch = element('input');
  arraySearch.type = 'search';
  arraySearch.placeholder = 'Find an array…';
  arraySearch.setAttribute('aria-label', 'Find table array');
  arraySearch.value = tableState.arrayFilter;
  function arrayOptions() {
    const matches = arrays
      .filter((ref) => ref.path.toLowerCase().includes(arraySearch.value.toLowerCase()))
      .slice(0, 100);
    if (!matches.includes(selected)) matches.unshift(selected);
    select.replaceChildren();
    for (const ref of matches) {
      const option = element('option', '', ref.path);
      option.value = ref.indices.join('/');
      select.append(option);
    }
    select.value = tableState.path;
  }
  arraySearch.oninput = () => {
    tableState.arrayFilter = arraySearch.value;
    arrayOptions();
  };
  arrayOptions();
  select.onchange = () => {
    tableState = { ...freshTable(), path: select.value, arrayFilter: arraySearch.value };
    renderOutput();
  };
  if (arrays.length > 100) tools.append(arraySearch);
  tools.append(select);
  const filter = element('input');
  filter.type = 'search';
  filter.setAttribute('aria-label', 'Filter table rows');
  filter.placeholder = 'Filter rows…';
  filter.value = tableState.filter;
  filter.oninput = () => {
    tableState.filter = filter.value;
    tableState.page = 0;
    const start = filter.selectionStart;
    renderOutput();
    const replacement = $('table-panel').querySelector('input[aria-label="Filter table rows"]');
    replacement.focus();
    if (start !== null)
      try {
        replacement.setSelectionRange(start, start);
      } catch {}
  };
  tools.append(filter);
  const keys = new Set();
  let primitives = false;
  for (const entry of selected.node.children) {
    if (entry.node.type === 'object') entry.node.children.forEach((e) => keys.add(e.key));
    else primitives = true;
  }
  const columns = [
    ...(primitives ? [{ id: 'value', name: 'Value' }] : []),
    ...[...keys].map((key) => ({ id: 'key:' + key, name: key, key })),
  ];
  if (!tableState.columnsReady) {
    columns.slice(20).forEach((column) => tableState.hidden.add(column.id));
    tableState.columnsReady = true;
  }
  columns
    .filter((column) => !tableState.hidden.has(column.id))
    .slice(20)
    .forEach((column) => tableState.hidden.add(column.id));
  const details = element('details', 'column-list'),
    summary = element('summary', '', 'Columns'),
    list = element('div');
  details.append(summary, list);
  const columnSearch = element('input');
  columnSearch.type = 'search';
  columnSearch.placeholder = 'Find a column…';
  columnSearch.setAttribute('aria-label', 'Find table column');
  const choices = element('div');
  list.append(columnSearch, choices);
  function columnChoices() {
    choices.replaceChildren();
    const matches = columns.filter((column) =>
      column.name.toLowerCase().includes(columnSearch.value.toLowerCase()),
    );
    for (const column of matches.slice(0, 100)) {
      const label = element('label'),
        check = element('input');
      check.type = 'checkbox';
      check.checked = !tableState.hidden.has(column.id);
      check.setAttribute('aria-label', 'Show column ' + column.name);
      check.onchange = () => {
        if (check.checked) {
          if (columns.filter((col) => !tableState.hidden.has(col.id)).length >= 20) {
            check.checked = false;
            toast('Show up to 20 columns. Hide another column first.');
            return;
          }
          tableState.hidden.delete(column.id);
        } else tableState.hidden.add(column.id);
        renderOutput();
      };
      label.append(check, document.createTextNode(column.name));
      choices.append(label);
    }
    if (matches.length > 100)
      choices.append(element('p', '', 'First 100 matches. Refine the column search.'));
  }
  columnSearch.oninput = columnChoices;
  columnChoices();
  tools.append(details);
  host.append(tools);
  if (columns.length > 20)
    host.append(element('p', 'notice', 'Showing up to 20 columns. Use Columns to choose fields.'));
  const cells = (node, col) =>
    col.id === 'value'
      ? node.type === 'object'
        ? null
        : node
      : node.type === 'object'
        ? node.children.find((e) => e.key === col.key)?.node
        : null;
  const lower = (tableState.filter || query).toLowerCase();
  let rows = StudioCore.children(selected)
    .map((ref, index) => ({ ...ref, index }))
    .filter((ref) => !lower || JsonCore.stringify(ref.node, '').toLowerCase().includes(lower));
  const sortColumn = columns.find((col) => col.id === tableState.sort);
  if (sortColumn)
    rows.sort((a, b) => {
      const av = cells(a.node, sortColumn),
        bv = cells(b.node, sortColumn);
      if (!av || !bv) return av ? -1 : bv ? 1 : a.index - b.index;
      const compare =
        av.type === 'number' && bv.type === 'number'
          ? StudioCore.compareNumbers(av.raw, bv.raw)
          : ((x, y) => (x === y ? 0 : x < y ? -1 : 1))(
              av.type === 'string' ? av.value : JsonCore.stringify(av, ''),
              bv.type === 'string' ? bv.value : JsonCore.stringify(bv, ''),
            );
      return compare * tableState.direction || a.index - b.index;
    });
  tableState.page = Math.min(tableState.page, Math.max(0, Math.ceil(rows.length / 100) - 1));
  const shown = columns.filter((col) => !tableState.hidden.has(col.id)),
    scroll = element('div', 'table-scroll'),
    table = element('table', 'data-table'),
    head = element('thead'),
    headRow = element('tr');
  headRow.append(element('th', '', '#'));
  for (const col of shown) {
    const th = element('th'),
      button = element(
        'button',
        '',
        col.name + (tableState.sort === col.id ? (tableState.direction === 1 ? ' ↑' : ' ↓') : ''),
      );
    button.setAttribute('aria-label', 'Sort column ' + col.name);
    button.onclick = () => {
      tableState.direction = tableState.sort === col.id ? -tableState.direction : 1;
      tableState.sort = col.id;
      tableState.page = 0;
      renderOutput();
    };
    th.append(button);
    headRow.append(th);
  }
  head.append(headRow);
  table.append(head);
  const body = element('tbody');
  for (const row of rows.slice(tableState.page * 100, (tableState.page + 1) * 100)) {
    const tr = element('tr');
    tr.append(element('td', '', String(row.index)));
    for (const col of shown) {
      const value = cells(row.node, col),
        td = element('td');
      if (value) {
        const button = element('button', 'table-cell type-' + value.type, preview(value));
        button.title = 'Locate this value';
        button.onclick = () => locateSource(value.start, value.end);
        td.append(button);
      } else td.textContent = '—';
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(body);
  scroll.append(table);
  host.append(scroll);
  pager(host, tableState.page, rows.length, (page) => {
    tableState.page = page;
    renderOutput();
  });
}
document
  .querySelectorAll('[data-mode]')
  .forEach((button) => (button.onclick = () => setMode(button.dataset.mode)));
$('new-document').onclick = () => addDocument();
$('duplicate-document').onclick = () =>
  addDocument(source.value, documents.find((d) => d.id === activeDocument).name + ' copy');
$('reopen-document').onclick = () => {
  if (documents.length >= 12) {
    toast('Close a document before reopening another.');
    return;
  }
  const doc = closedDocuments.pop();
  if (doc) {
    documents.push(doc);
    activateDocument(doc.id);
    renderDocuments();
  }
};
$('document-tabs').onkeydown = (event) => {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const index = documents.findIndex((d) => d.id === activeDocument),
    next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? documents.length - 1
          : (index + (event.key === 'ArrowRight' ? 1 : -1) + documents.length) % documents.length;
  activateDocument(documents[next].id);
  $('document-tabs').querySelector('[aria-selected="true"]').focus();
};
$('rename-document').onclick = () => {
  $('document-name').value = documents.find((doc) => doc.id === activeDocument).name;
  $('name-dialog').showModal();
};
$('name-cancel').onclick = () => $('name-dialog').close();
$('name-form').onsubmit = (event) => {
  event.preventDefault();
  const name = $('document-name').value.trim();
  if (!name) {
    $('document-name').focus();
    return;
  }
  documents.find((doc) => doc.id === activeDocument).name = name;
  $('name-dialog').close();
  renderDocuments();
};
$('diff-left').oninput = () => {
  const area = $('diff-left');
  if (area.value.length > JsonCore.MAX_LENGTH) {
    area.value = source.value;
    toast('Input exceeds 2 Mi characters. Your current text is unchanged.');
    return;
  }
  setInput(area.value, undefined, {
    start: area.selectionStart,
    end: area.selectionEnd,
    top: 0,
    left: 0,
  });
};
$('diff-right').oninput = () => {
  const current = featureJobs.get('diff');
  if (current) {
    clearTimeout(current.timer);
    current.worker.terminate();
    featureJobs.delete('diff');
  }
  diffChanges = [];
  refreshDiffPaint();
  $('diff-results').replaceChildren();
  $('diff-position').textContent = '0 / 0';
  $('diff-next').disabled = $('diff-previous').disabled = true;
  $('diff-document').value = '';
  scheduleDiff();
};
$('diff-ignore-order').onchange = scheduleDiff;
$('compare').onclick = runDiff;
$('diff-snapshot').onclick = () => {
  $('diff-right').value = source.value;
  scheduleDiff();
};
$('diff-document').onchange = () => {
  saveDocument();
  const doc = documents.find((item) => String(item.id) === $('diff-document').value);
  if (doc) {
    $('diff-right').value = doc.text || '';
    scheduleDiff();
  }
};
$('diff-previous').onclick = () => jumpDiff(diffIndex - 1);
$('diff-next').onclick = () => jumpDiff(diffIndex + 1);
$('run-query').onclick = runQuery;
$('path-expression').onkeydown = (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    runQuery();
  }
};
$('path-expression').oninput = () => {
  invalidateFeatures();
};
$('copy-query').onclick = () => {
  if (queryMatches) copy(queryJSON(), 'Query results copied');
};
$('export-query').onclick = () => {
  if (queryMatches) downloadText(queryJSON() + '\n', 'query-results.json');
};
$('validate-schema').onclick = runSchema;
$('schema-source').oninput = () => invalidateFeatures();
$('schema-example').onclick = () => {
  $('schema-source').value = JSON.stringify(
    {
      type: 'object',
      required: ['id'],
      properties: { id: { type: 'integer', minimum: 1 }, name: { type: 'string', minLength: 1 } },
    },
    null,
    2,
  );
  invalidateFeatures();
};
$('edit-form').onsubmit = applyNodeEdit;
$('edit-cancel').onclick = () => $('edit-dialog').close();
$('edit-action').onchange = () => {
  if ($('edit-action').value === 'add') {
    $('edit-value').value = 'null';
    $('edit-key').value = '';
  }
  updateEditFields();
};
$('table-tab').onclick = () => switchView('table');
renderDocuments();

// Shared read-only paint layer: the native textarea remains the editing surface.
function codeSurface(area) {
  const host = element('div', 'code-surface'),
    gutter = element('div', 'code-gutter'),
    paint = element('pre', 'code-paint');
  gutter.setAttribute('aria-hidden', 'true');
  paint.setAttribute('aria-hidden', 'true');
  area.before(host);
  host.append(gutter, paint, area);
  const state = { area, text: null, lines: [], starts: [], tokens: [], ranges: [], active: null };
  function refresh() {
    if (state.text !== area.value) {
      state.text = area.value;
      state.lines = state.text.split('\n');
      let offset = 0;
      state.starts = state.lines.map((line) => {
        const start = offset;
        offset += line.length + 1;
        return start;
      });
      state.tokens = EditorCore.analyze(state.text).tokens;
    }
    draw();
  }
  function draw() {
    if (!area.clientHeight) return;
    const height = parseFloat(getComputedStyle(area).lineHeight),
      top = area.scrollTop,
      left = area.scrollLeft;
    const first = Math.max(0, Math.floor((top - 16) / height) - 2),
      last = Math.min(state.lines.length, first + Math.ceil(area.clientHeight / height) + 5);
    const numbers = document.createDocumentFragment(),
      lines = document.createDocumentFragment();
    paint.style.width = area.clientWidth + 'px';
    for (let i = first; i < last; i++) {
      const start = state.starts[i],
        end = start + state.lines[i].length,
        y = 16 + i * height - top;
      let rlo = 0,
        rhi = state.ranges.length;
      while (rlo < rhi) {
        const mid = (rlo + rhi) >> 1;
        if (state.ranges[mid].end <= start) rlo = mid + 1;
        else rhi = mid;
      }
      const ranges = [];
      for (let j = rlo; j < state.ranges.length && state.ranges[j].start <= end; j++)
        ranges.push(state.ranges[j]);
      const isActive = state.active && state.active.start <= end && state.active.end > start;
      const kinds = new Set(ranges.map((r) => r.kind)),
        kind = kinds.size > 1 ? 'modified' : ranges[0]?.kind;
      const line = element(
        'div',
        'paint-line' + (kind ? ' diff-' + kind : '') + (isActive ? ' active-line' : ''),
      );
      line.style.top = y + 'px';
      line.style.left = 14 - left + 'px';
      const number = element('div', 'code-line-number', String(i + 1));
      number.style.top = y + 'px';
      numbers.append(number);
      if (state.lines[i].length > 20000) {
        line.textContent = state.lines[i];
        lines.append(line);
        continue;
      }
      let lo = 0,
        hi = state.tokens.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (state.tokens[mid].end <= start) lo = mid + 1;
        else hi = mid;
      }
      const tokens = [];
      for (let j = lo; j < state.tokens.length && state.tokens[j].start < end; j++)
        tokens.push(state.tokens[j]);
      const points = new Set([start, end]);
      for (const item of [...tokens, ...ranges]) {
        points.add(Math.max(start, item.start));
        points.add(Math.min(end, item.end));
      }
      const stops = [...points].filter((n) => n >= start && n <= end).sort((a, b) => a - b);
      let ti = 0,
        ri = 0;
      for (let n = 0; n < stops.length - 1; n++) {
        const from = stops[n],
          to = stops[n + 1];
        if (from === to) continue;
        while (ti < tokens.length && tokens[ti].end <= from) ti++;
        while (ri < ranges.length && ranges[ri].end <= from) ri++;
        const token = tokens[ti]?.start <= from ? tokens[ti] : null,
          range = ranges[ri]?.start <= from ? ranges[ri] : null;
        let chunk = element('span', token?.type, state.text.slice(from, to));
        if (range) {
          const mark = element('mark', 'range-' + range.kind);
          mark.append(chunk);
          chunk = mark;
        }
        line.append(chunk);
      }
      if (!line.childNodes.length) line.textContent = '\u200b';
      lines.append(line);
    }
    gutter.replaceChildren(numbers);
    paint.replaceChildren(lines);
  }
  state.refresh = refresh;
  state.draw = draw;
  state.mark = (ranges = [], active = null) => {
    const events = ranges
        .flatMap((range) => [
          { at: range.start, kind: range.kind, delta: 1 },
          { at: range.end, kind: range.kind, delta: -1 },
        ])
        .sort((a, b) => a.at - b.at),
      counts = {},
      merged = [];
    let last = 0,
      kind = null;
    for (let i = 0; i < events.length;) {
      const at = events[i].at;
      if (kind && at > last) {
        const previous = merged.at(-1);
        if (previous?.end === last && previous.kind === kind) previous.end = at;
        else merged.push({ start: last, end: at, kind });
      }
      while (i < events.length && events[i].at === at) {
        const event = events[i++];
        counts[event.kind] = (counts[event.kind] || 0) + event.delta;
      }
      kind = ['location', 'removed', 'added', 'modified', 'reordered'].find(
        (key) => counts[key] > 0,
      );
      last = at;
    }
    state.ranges = merged;
    state.active = active;
    refresh();
  };
  area.addEventListener('scroll', draw);
  area.addEventListener('input', refresh);
  new ResizeObserver(draw).observe(area);
  refresh();
  codeSurfaces.set(area.id, state);
  return state;
}
function refreshDiffPaint() {
  for (const [id, side] of [
    ['diff-left', 'before'],
    ['diff-right', 'after'],
  ]) {
    const surface = codeSurfaces.get(id);
    if (!surface) continue;
    const ranges = diffChanges
      .filter((change) => change[side])
      .map((change) => ({ ...change[side], kind: change.kind }));
    surface.mark(ranges, diffChanges[diffIndex]?.[side]);
  }
}
function refreshContext(kind, reset = false) {
  const area = $(kind + '-preview');
  area.value = source.value;
  const surface = codeSurfaces.get(area.id);
  if (reset) {
    contextSelections[kind] = null;
    $(kind + '-location').textContent = 'Active document';
    $(kind + '-location').title = 'Active document';
    surface?.mark();
  } else surface?.refresh();
}
function showContext(kind, node, path) {
  contextSelections[kind] = { node, path };
  refreshContext(kind);
  const caption = $(kind + '-location');
  caption.textContent = path;
  caption.title = path;
  source.setSelectionRange(node.start, node.end);
  const area = $(kind + '-preview');
  codeSurfaces.get(area.id).mark([{ ...node, kind: 'location' }], node);
  selectIn(area, node);
}
function selectTree(indices, path) {
  selectedTreeIndices = indices;
  document
    .querySelectorAll('#tree .tree-row[data-indices]')
    .forEach((row) =>
      row.classList.toggle('selected-node', row.dataset.indices === indices.join('/')),
    );
  renderBreadcrumb();
}
function renderBreadcrumb() {
  const host = $('tree-breadcrumb');
  host.hidden = !parsed || view !== 'tree';
  if (host.hidden) return;
  let current = parsed.root,
    path = '$';
  const entries = [{ indices: [], node: current, path, label: '$' }];
  for (let i = 0; i < selectedTreeIndices.length; i++) {
    const index = selectedTreeIndices[i],
      entry = current.children?.[index];
    if (!entry) {
      selectedTreeIndices = [];
      break;
    }
    const key = current.type === 'object' ? entry.key : index;
    path = StudioCore.pathKey(path, key);
    current = entry.node;
    entries.push({
      indices: selectedTreeIndices.slice(0, i + 1),
      node: current,
      path,
      label: typeof key === 'number' ? '[' + key + ']' : key,
    });
  }
  host.replaceChildren();
  for (const [i, entry] of entries.entries()) {
    if (i) host.append(element('span', '', '/'));
    const button = element('button', '', entry.label);
    button.title = entry.path;
    button.setAttribute('aria-label', 'Select ancestor ' + entry.path);
    button.onclick = () => {
      let id = 'root';
      overrides.set(id, true);
      for (const index of entry.indices) {
        id += '/' + index;
        overrides.set(id, true);
      }
      selectedTreeIndices = entry.indices;
      renderOutput();
      locateSource(entry.node.start, entry.node.end);
      const row = [...$('tree').querySelectorAll('[data-indices]')].find(
        (row) => row.dataset.indices === entry.indices.join('/'),
      );
      row?.querySelector('.node-label')?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    };
    host.append(button);
  }
}
function beginInlineEdit(row, label, node, indices, path) {
  if (node.children) {
    openNodeEditor(indices, path);
    return;
  }
  inlineSession?.cancel();
  const version = inputVersion,
    documentId = activeDocument,
    form = element('form', 'inline-edit'),
    input = element('input'),
    save = element('button', 'text-button', 'Save'),
    cancel = element('button', 'text-button', 'Cancel'),
    error = element('span', 'form-error');
  input.value = node.type === 'string' ? node.value : JsonCore.primitive(node);
  input.setAttribute('aria-label', 'Edit value ' + path);
  input.spellcheck = false;
  save.type = 'submit';
  save.setAttribute('aria-label', 'Save value ' + path);
  cancel.type = 'button';
  cancel.setAttribute('aria-label', 'Cancel edit ' + path);
  error.setAttribute('role', 'alert');
  label.hidden = true;
  label.after(form);
  form.append(input, save, cancel, error);
  const close = () => {
    form.remove();
    label.hidden = false;
    inlineSession = null;
    label.focus({ preventScroll: true });
  };
  inlineSession = { cancel: close };
  cancel.onclick = close;
  form.onsubmit = (event) => {
    event.preventDefault();
    if (version !== inputVersion || documentId !== activeDocument) {
      error.textContent = 'Document changed. Cancel and try again.';
      return;
    }
    try {
      const value = node.type === 'string' ? JSON.stringify(input.value) : input.value,
        next = StudioCore.modify(parsed.root, indices, 'replace', { value });
      if (StudioCore.getNode(next, indices).children)
        throw Error('Use Edit for objects and arrays.');
      const text = JsonCore.stringify(next, indent());
      JsonCore.parse(text);
      inlineSession = null;
      setInput(text, 'Value updated. Undo to restore.');
      selectedTreeIndices = indices;
      renderOutput();
      const replacement = [...$('tree').querySelectorAll('[data-indices]')].find(
        (item) => item.dataset.indices === indices.join('/'),
      );
      replacement?.querySelector('.node-label')?.focus({ preventScroll: true });
    } catch (err) {
      error.textContent = err.message;
    }
  };
  input.onkeydown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };
  input.focus();
  input.select();
}
function setPanelFocus(group, side) {
  const host = $(group === 'workspace' ? 'workspace-panes' : 'diff-editors'),
    active = host.classList.contains('focus-' + side);
  host.classList.remove('focus-left', 'focus-right');
  if (!active) host.classList.add('focus-' + side);
  document.querySelectorAll('[data-focus^="' + group + ':"]').forEach((button) => {
    const selected = !active && button.dataset.focus.endsWith(':' + side);
    button.setAttribute('aria-pressed', String(selected));
    button.setAttribute(
      'aria-label',
      selected ? 'Restore ' + group + ' split view' : button.dataset.defaultLabel,
    );
    button.title = button.getAttribute('aria-label');
  });
  syncGutterSize(true);
  for (const surface of codeSurfaces.values()) surface.draw();
}
function bindSplitter(handle, host, vertical = false) {
  const apply = (value) => {
    const max = vertical ? Math.max(140, $('diff-mode').clientHeight - 230) : 80,
      min = vertical ? 140 : 20;
    value = Math.round(Math.min(max, Math.max(min, value)));
    host.style.setProperty(vertical ? '--diff-height' : '--split', value + (vertical ? 'px' : '%'));
    handle.setAttribute('aria-valuemax', String(max));
    handle.setAttribute('aria-valuenow', String(value));
  };
  const reset = () => apply(vertical ? 300 : 50);
  handle.ondblclick = reset;
  handle.onkeydown = (event) => {
    const keys = vertical ? ['ArrowUp', 'ArrowDown'] : ['ArrowLeft', 'ArrowRight'];
    if (keys.includes(event.key)) {
      event.preventDefault();
      apply(
        Number(handle.getAttribute('aria-valuenow')) +
          (event.key === keys[0] ? -1 : 1) * (vertical ? 20 : 5),
      );
    } else if (event.key === 'Home' || event.key === 'Enter') {
      event.preventDefault();
      reset();
    }
  };
  handle.onpointerdown = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    handle.focus();
    handle.setPointerCapture(event.pointerId);
    const rect = host.getBoundingClientRect();
    const move = (e) =>
      apply(vertical ? e.clientY - rect.top : ((e.clientX - rect.left) / rect.width) * 100);
    handle.onpointermove = move;
    const stop = () => {
      handle.onpointermove = null;
      handle.onpointerup = null;
      handle.onpointercancel = null;
    };
    handle.onpointerup = stop;
    handle.onpointercancel = stop;
  };
  return reset;
}
function initializeUI() {
  for (const id of ['diff-left', 'diff-right', 'path-preview', 'schema-preview'])
    codeSurface($(id));
  const resets = [
    bindSplitter($('workspace-divider'), $('workspace-panes')),
    bindSplitter($('diff-divider'), $('diff-editors')),
    bindSplitter($('diff-height-divider'), $('diff-editors'), true),
  ];
  document.querySelectorAll('[data-focus]').forEach((button) => {
    button.dataset.defaultLabel = button.getAttribute('aria-label');
    button.onclick = () => setPanelFocus(...button.dataset.focus.split(':'));
  });
  $('reset-layout').onclick = () => {
    resets.forEach((reset) => reset());
    for (const group of ['workspace', 'diff']) {
      const host = $(group === 'workspace' ? 'workspace-panes' : 'diff-editors');
      if (host.classList.contains('focus-left')) setPanelFocus(group, 'left');
      if (host.classList.contains('focus-right')) setPanelFocus(group, 'right');
    }
    $('display-settings').open = false;
  };
  $('code-size').onchange = () => {
    const size = Number($('code-size').value);
    document.documentElement.style.setProperty('--code-size', size + 'px');
    document.documentElement.style.setProperty('--code-line', size + 10 + 'px');
    syncGutterSize(true);
    for (const surface of codeSurfaces.values()) surface.draw();
  };
  for (const kind of ['path', 'schema'])
    $(kind + '-edit-source').onclick = () => {
      const selected = contextSelections[kind];
      setMode('workspace');
      if (selected) locateSource(selected.node.start, selected.node.end);
      else source.focus();
    };
  for (const id of ['diff-left', 'diff-right'])
    $(id).addEventListener('scroll', () => {
      if (!$('diff-sync').checked || performance.now() < suppressDiffSyncUntil) return;
      const from = $(id),
        to = $(id === 'diff-left' ? 'diff-right' : 'diff-left'),
        range = from.scrollHeight - from.clientHeight,
        target = range > 0 ? (from.scrollTop / range) * (to.scrollHeight - to.clientHeight) : 0;
      if (Math.abs(to.scrollTop - target) > 1) to.scrollTop = target;
      if (Math.abs(to.scrollLeft - from.scrollLeft) > 1) to.scrollLeft = from.scrollLeft;
    });
  document.addEventListener('click', (event) => {
    for (const id of ['document-menu', 'display-settings']) {
      const menu = $(id);
      if (!menu.contains(event.target) || event.target.closest('button')) menu.open = false;
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      for (const id of ['document-menu', 'display-settings']) $(id).open = false;
    }
  });
  setMode('workspace');
}

initializeUI();
new ResizeObserver(() => syncGutterSize()).observe(source);
updateInput();
updateHistory();
parseNow();
