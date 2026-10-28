import { snapshot, captureSelection, applyResult, focusEditor, showError } from './editor.js';

const $ = (id) => document.getElementById(id);
const consoleWindow = $('console');
const history = [];
let token;
let reference;
let controller;
let activeTab = 'console';
let requestSequence = 0;
let activeRequestId;
let preContextSelection;

async function api(path, body, signal) {
  const response = await fetch(path, {
    method: body === undefined ? 'GET' : 'POST',
    headers:
      body === undefined ? {} : { 'Content-Type': 'application/json', 'X-Studio-Token': token },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error?.message || `Request failed (${response.status}).`);
    error.details = data.error;
    throw error;
  }
  return data;
}

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function addMessage(role, text, details) {
  $('conversation').querySelector('.welcome')?.remove();
  const wrapper = node('article', undefined, `message ${role}`);
  wrapper.append(
    node(
      'div',
      role === 'user' ? 'You' : role === 'assistant' ? 'AI' : role === 'error' ? 'Error' : 'Studio',
      'message-label',
    ),
  );
  wrapper.append(node('div', text, 'message-body'));
  if (details) {
    const disclosure = node('details');
    disclosure.append(
      node('summary', 'Execution details'),
      node('pre', JSON.stringify(details, null, 2)),
    );
    wrapper.append(disclosure);
  }
  $('conversation').append(wrapper);
  $('conversation').scrollTop = $('conversation').scrollHeight;
  return wrapper;
}

function setBusy(busy) {
  $('engine-status').textContent = busy ? 'Working…' : 'Ready';
  $('send').hidden = busy;
  $('stop').hidden = !busy;
  $('chat-input').disabled = busy;
}

function updateScope() {
  const selection = snapshot().selection;
  $('scope-hint').textContent =
    selection.end > selection.start
      ? `${selection.end - selection.start} selected · Enter to send`
      : 'Current text · Enter to send';
}

function selectTab(tab) {
  activeTab = tab;
  for (const button of document.querySelectorAll('[data-tab]')) {
    const selected = button.dataset.tab === tab;
    button.setAttribute('aria-selected', selected);
    button.tabIndex = selected ? 0 : -1;
    $('panel-' + button.dataset.tab).hidden = !selected;
  }
  if (tab === 'console' && !controller) $('chat-input').focus();
}

function openConsole() {
  consoleWindow.hidden = false;
  clampWindow();
  updateScope();
  selectTab(activeTab);
}

function closeConsole() {
  consoleWindow.hidden = true;
  focusEditor();
}

$('source').addEventListener('pointerdown', (event) => {
  if (event.button === 2) preContextSelection = captureSelection();
});
$('editor').addEventListener('contextmenu', (event) => {
  event.preventDefault();
  if (preContextSelection) {
    $('source').setSelectionRange(preContextSelection.start, preContextSelection.end);
    preContextSelection = null;
  }
  captureSelection();
  openConsole();
});
$('source').addEventListener('select', updateScope);
document.addEventListener('keydown', (event) => {
  if ((event.ctrlKey || event.metaKey) && event.code === 'Backquote') {
    event.preventDefault();
    if (consoleWindow.hidden) {
      captureSelection();
      openConsole();
    } else closeConsole();
  }
  if (event.key === 'Escape' && !consoleWindow.hidden) {
    event.preventDefault();
    closeConsole();
  }
});
$('console-close').onclick = closeConsole;
for (const button of document.querySelectorAll('[data-tab]')) {
  button.onclick = () => selectTab(button.dataset.tab);
  button.onkeydown = (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const tabs = ['console', 'protocols', 'settings'];
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? 2
          : (tabs.indexOf(activeTab) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
    selectTab(tabs[next]);
    $('tab-' + tabs[next]).focus();
  };
}

function clampWindow() {
  if (consoleWindow.hidden) return;
  const box = consoleWindow.getBoundingClientRect();
  consoleWindow.style.left = Math.max(8, Math.min(box.left, innerWidth - box.width - 8)) + 'px';
  consoleWindow.style.top = Math.max(8, Math.min(box.top, innerHeight - box.height - 8)) + 'px';
  consoleWindow.style.right = 'auto';
  consoleWindow.style.bottom = 'auto';
}
let drag;
$('console-header').addEventListener('pointerdown', (event) => {
  if (event.target.closest('button') || event.button !== 0) return;
  const rect = consoleWindow.getBoundingClientRect();
  drag = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  $('console-header').setPointerCapture(event.pointerId);
});
$('console-header').addEventListener('pointermove', (event) => {
  if (!drag) return;
  consoleWindow.style.left = event.clientX - drag.x + 'px';
  consoleWindow.style.top = event.clientY - drag.y + 'px';
  clampWindow();
});
$('console-header').addEventListener('pointerup', () => {
  drag = null;
});
$('console-header').addEventListener('lostpointercapture', () => {
  drag = null;
});
window.addEventListener('resize', clampWindow);
new ResizeObserver(clampWindow).observe(consoleWindow);

function renderTable(title, columns, rows) {
  const wrapper = node('div', undefined, 'table-scroll');
  const table = node('table', undefined, 'protocol-table');
  table.append(node('caption', title));
  const head = node('thead'),
    heading = node('tr');
  for (const column of columns) {
    const th = node('th', column);
    th.scope = 'col';
    heading.append(th);
  }
  head.append(heading);
  const body = node('tbody');
  for (const row of rows) {
    const tr = node('tr');
    for (const cell of row) {
      const td = node('td');
      td.append(typeof cell === 'string' ? document.createTextNode(cell) : cell);
      tr.append(td);
    }
    body.append(tr);
  }
  table.append(head, body);
  wrapper.append(table);
  return wrapper;
}

function renderTools() {
  if (!reference) return;
  const query = $('protocol-search').value.toLowerCase();
  const tools = reference.tools.filter((tool) =>
    JSON.stringify(tool).toLowerCase().includes(query),
  );
  $('tool-count').textContent =
    `${tools.length} of ${reference.tools.length} tools · Protocol v${reference.version}`;
  const rows = tools.map((tool) => {
    const description = node('div');
    description.append(
      node('p', tool.description),
      node('p', `${tool.input} → ${tool.output} · ${tool.effect}`, 'muted'),
    );
    const parameters = node('div');
    for (const [name, spec] of Object.entries(tool.parameters.properties)) {
      const required = tool.parameters.required.includes(name);
      parameters.append(
        node(
          'p',
          `${name} · ${spec.type}${required ? ' · required' : ''}${'default' in spec ? ` · default ${JSON.stringify(spec.default)}` : ''}\n${spec.description}${spec.enum ? ` [${spec.enum.join(', ')}]` : ''}`,
        ),
      );
    }
    if (!parameters.childElementCount) parameters.append(node('p', 'No arguments.'));
    const details = node('details');
    details.append(
      node('summary', 'Schema & example'),
      node('pre', JSON.stringify({ parameters: tool.parameters, example: tool.example }, null, 2)),
    );
    parameters.append(details);
    return [tool.name, description, parameters];
  });
  $('tool-reference').replaceChildren(
    renderTable('Python tool registry', ['Tool', 'Behavior', 'Arguments'], rows),
  );
}

function renderReference() {
  renderTools();
  const fragment = document.createDocumentFragment();
  for (const table of reference.tables)
    fragment.append(renderTable(table.title, table.columns, table.rows));
  for (const [label, value] of [
    ['JSON examples', reference.examples],
    ['Response JSON Schema', reference.responseSchema],
    ['System instructions', reference.systemPrompt],
  ]) {
    const details = node('details');
    details.append(
      node('summary', label),
      node(
        'pre',
        typeof value === 'string' ? value : JSON.stringify(value, null, 2),
        'protocol-example',
      ),
    );
    fragment.append(details);
  }
  $('protocol-reference').replaceChildren(fragment);
}
$('protocol-search').oninput = renderTools;

async function saveSettings(test = false) {
  const status = $('settings-status');
  status.classList.remove('is-error');
  status.textContent = test ? 'Saving and testing…' : 'Saving…';
  const buttons = [...$('settings-form').querySelectorAll('button')];
  buttons.forEach((button) => {
    button.disabled = true;
  });
  try {
    await ready;
    const saved = await api('/api/settings', {
      baseUrl: $('api-base').value.trim(),
      model: $('api-model').value.trim(),
      apiKey: $('api-key').value,
      clearKey: $('clear-key').checked,
    });
    $('api-key').value = '';
    $('api-key').placeholder = saved.hasKey
      ? 'Key saved · leave blank to keep'
      : 'API key (optional for local providers)';
    $('clear-key').checked = false;
    status.textContent = 'Settings saved in service memory.';
    if (test) status.textContent = (await api('/api/test', {})).message;
  } catch (error) {
    status.textContent = error.message;
    status.classList.add('is-error');
  } finally {
    buttons.forEach((button) => {
      button.disabled = false;
    });
  }
}
$('settings-form').onsubmit = (event) => {
  event.preventDefault();
  saveSettings();
};
$('test-connection').onclick = () => {
  if ($('settings-form').reportValidity()) saveSettings(true);
};
for (const input of $('settings-form').querySelectorAll('input'))
  input.addEventListener('input', () => {
    $('settings-status').textContent = '';
  });

$('chat-input').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    $('chat-form').requestSubmit();
  }
});
$('chat-form').onsubmit = async (event) => {
  event.preventDefault();
  const message = $('chat-input').value.trim();
  if (!message || controller) return;
  const requestId = ++requestSequence;
  activeRequestId = crypto.randomUUID();
  const serverRequestId = activeRequestId;
  const base = snapshot();
  const previousHistory = history.slice(-8);
  history.push({ role: 'user', content: message });
  addMessage('user', message);
  $('chat-input').value = '';
  controller = new AbortController();
  const signal = controller.signal;
  setBusy(true);
  try {
    await ready;
    const data = await api(
      '/api/chat',
      { requestId: serverRequestId, message, snapshot: base, history: previousHistory },
      signal,
    );
    if (requestId !== requestSequence || signal.aborted) return;
    let outcome;
    if (data.result) outcome = applyResult(data.result, data.baseRevision);
    if (outcome?.stale) {
      addMessage(
        'system',
        'The editor changed while AI was working. The result was not applied. Ask again to use the current text.',
        { trace: data.trace, attempts: data.attempts },
      );
      history.push({
        role: 'assistant',
        content: 'Result was not applied because the editor changed.',
      });
    } else {
      const summary =
        data.type === 'executed'
          ? outcome?.changed
            ? 'Updated the editor.'
            : 'There is no history entry to restore.'
          : data.message;
      const responseText =
        data.type === 'executed' && data.message ? `${data.message}\n${summary}` : summary;
      addMessage(
        'assistant',
        responseText,
        data.attempts?.length ? { trace: data.trace, attempts: data.attempts } : undefined,
      );
      history.push({ role: 'assistant', content: responseText });
    }
    for (const report of data.reports || []) {
      const item = addMessage('system', report.tool);
      item.append(node('pre', report.text));
    }
    if (history.length > 24) history.splice(0, history.length - 24);
  } catch (error) {
    if (error.name !== 'AbortError') {
      addMessage('error', error.message, error.details);
      const details = error.details?.lastError || error.details;
      if (details?.line && snapshot().revision === base.revision) showError(details);
      history.push({
        role: 'assistant',
        content: `Execution failed. No changes were applied. ${error.message}`,
      });
      if (error.details?.code === 'CONFIGURATION') selectTab('settings');
    }
  } finally {
    if (requestId === requestSequence) {
      controller = null;
      activeRequestId = null;
      setBusy(false);
      if (!consoleWindow.hidden && activeTab === 'console') $('chat-input').focus();
    }
  }
};
$('stop').onclick = () => {
  if (token && activeRequestId) api('/api/cancel', { requestId: activeRequestId }).catch(() => {});
  controller?.abort();
  controller = null;
  activeRequestId = null;
  requestSequence++;
  setBusy(false);
  addMessage('system', 'Stopped. No pending result will be applied.');
  history.push({
    role: 'assistant',
    content: 'The user cancelled the operation. No changes were applied.',
  });
  $('chat-input').focus();
};

const ready = api('/api/bootstrap')
  .then((data) => {
    token = data.token;
    reference = data.reference;
    $('api-base').value = data.settings.baseUrl;
    $('api-model').value = data.settings.model;
    $('api-key').placeholder = data.settings.hasKey
      ? 'Key saved · leave blank to keep'
      : 'API key (optional for local providers)';
    renderReference();
  })
  .catch((error) => {
    $('engine-status').textContent = 'Offline';
    addMessage('error', `Could not load the local Python engine. ${error.message}`);
    throw error;
  });
ready.catch(() => {});
