/* Presentation only: the main process owns runs and active configuration. */
const $ = id => document.getElementById(id);
const state = new WorkspaceState();
const editor = new toastui.Editor({ el: $('editor'), height: '100%', initialEditType: 'markdown', previewStyle: 'tab', hideModeSwitch: true, usageStatistics: false, autofocus: true, placeholder: '', toolbarItems: [], plugins: [window.liveMath] });
let presets = {}, appliedSettings = null, settingsBusy = false, starting = false;
let copiedText = '';
let attachments = [];
function renderAttachments() { $('dataset-list').replaceChildren(...attachments.map(item => { const button = document.createElement('button'); button.className = 'dataset-chip'; button.textContent = item.name + ' · ' + item.rows + ' rows × ' + item.columns.length + ' columns ×'; button.title = 'Remove attachment'; button.onclick = () => { attachments = attachments.filter(x => x.id !== item.id); renderAttachments(); }; return button; })); }
$('import-data').onclick = async () => { if (attachments.length >= 4) return notice('Attach at most four datasets.'); try { const item = await command('importDataset'); if (item) { attachments.push(item); renderAttachments(); notice(''); } } catch (error) { notice(error.message); } };
const labels = { running: 'Running', streaming: 'Generating', queued: 'Queued', understanding: 'Understanding', solving: 'Solving', verifying: 'Verifying', explaining: 'Generating AI answer', completed: 'Completed', failed: 'Failed', cancelled: 'Cancelled', cancelling: 'Stopping', timed_out: 'Timed out' };
const escape = text => String(text).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const markdown = text => window.mathMarkdown.renderMarkdown(text);
async function command(name, payload) { const result = await window.workspace.command(name, payload); if (!result.ok) throw Error(result.error.message); return result.value; }
function notice(message = '') { $('notice').textContent = message; }
function input() { return editor.getMarkdown(); }
editor.on('change', renderResult);
function openPanel(id) { for (const panel of document.querySelectorAll('dialog[open]')) panel.close(); $(id).showModal(); }
function showSolution(open = true) { $('solution-pane').hidden = !open; $('workspace').classList.toggle('split', open); $('result-button').setAttribute('aria-expanded', String(open)); }
$('result-button').onclick = () => { render(); showSolution($('solution-pane').hidden); };
$('close-result').onclick = () => showSolution(false);
$('history-button').onclick = () => openPanel('history-dialog');
$('close-history').onclick = () => $('history-dialog').close();
function renderControls() {
  const busy = state.busy || starting;
  $('solve').disabled = busy || settingsBusy; $('stop').hidden = !state.busy;
  $('import-data').disabled = busy || settingsBusy;
  $('activity-stop').hidden = !state.busy; $('settings-button').disabled = busy;
  $('result-button').textContent = state.busy ? 'Result · Running' : state.selected?.status === 'completed' ? 'Result · Ready' : 'Result';
  $('clear').disabled = busy; $('retry').disabled = busy || !state.selected;
}
function renderHistory() {
  $('history').replaceChildren();
  for (const run of [...state.runs.values()].reverse()) {
    const button = document.createElement('button'); button.className = 'history-item' + (run.id === state.selectedId ? ' selected' : '');
    const title = document.createElement('strong'); title.textContent = run.input.slice(0, 65);
    const meta = document.createElement('small'); meta.textContent = labels[run.status] + ' · ' + new Date(run.createdAt).toLocaleTimeString('en', { hour: '2-digit', minute: '2-digit' });
    button.append(title, meta); button.onclick = () => { state.selectedId = run.id; render(); $('history-dialog').close(); showSolution(); };
    $('history').append(button);
  }
}
let displayedRun = null;
const blockNodes = new Map(), toolNodes = new Map();
const artifactCache = new Map();
const scrollPane = document.querySelector('.solution-content');
let followOutput = true;
scrollPane.addEventListener('scroll', () => { followOutput = scrollPane.scrollHeight - scrollPane.scrollTop - scrollPane.clientHeight < 60; $('jump-latest').hidden = followOutput; });
$('jump-latest').onclick = () => { followOutput = true; scrollPane.scrollTop = scrollPane.scrollHeight; $('jump-latest').hidden = true; };
function fillArtifact(node, item) {
  const view = item.value; node.replaceChildren();
  const caption = document.createElement('figcaption'); caption.textContent = view.title || 'Result'; node.append(caption);
  if (view.kind === 'image') {
    const img = document.createElement('img'); img.alt = view.title || 'Computed chart'; img.src = 'data:image/png;base64,' + view.data; img.onload = () => { if (followOutput) scrollPane.scrollTop = scrollPane.scrollHeight; }; node.append(img);
    const save = document.createElement('a'); save.textContent = 'Save PNG'; save.href = img.src; save.download = 'math-chart.png'; node.append(save);
  } else if (view.kind === 'math') {
    const div = document.createElement('div'); div.className = 'markdown-result'; div.innerHTML = markdown('$$\n' + view.latex + '\n$$'); node.append(div);
  } else if (view.kind === 'table') {
    const wrap = document.createElement('div'); wrap.className = 'table-scroll'; const table = document.createElement('table');
    const header = table.createTHead().insertRow(); for (const name of view.columns) { const th = document.createElement('th'); th.textContent = name; header.append(th); }
    const body = table.createTBody(); for (const values of view.rows) { const row = body.insertRow(); for (const value of values) row.insertCell().textContent = value === null ? '—' : String(value); }
    wrap.append(table); node.append(wrap); const count = document.createElement('small'); count.textContent = view.rows.length + ' displayed rows' + (view.totalRows !== undefined ? ' / ' + view.totalRows + ' total' : ''); node.append(count);
    const copy = document.createElement('button'); copy.textContent = 'Copy table'; copy.onclick = () => navigator.clipboard.writeText([view.columns,...view.rows].map(row=>row.map(v=>String(v??'').replace(/\t|\r?\n/g,' ')).join('\t')).join('\n')).catch(e=>notice(e.message)); node.append(copy);
  }
}
function renderVisuals(run, block, node) {
  for (const artifact of block.output?.artifacts || []) {
    if (!['image','table','math'].includes(artifact.kind) || node.querySelector('[data-artifact="' + artifact.id + '"]')) continue;
    const figure = document.createElement('figure'); figure.className = 'computed-artifact'; figure.dataset.artifact = artifact.id; figure.textContent = 'Loading ' + artifact.title + '…'; node.append(figure);
    if (!artifactCache.has(artifact.id)) artifactCache.set(artifact.id, command('artifact', { runId: run.id, id: artifact.id }));
    artifactCache.get(artifact.id).then(item => { if (figure.isConnected) { fillArtifact(figure,item); if (followOutput) scrollPane.scrollTop = scrollPane.scrollHeight; } }).catch(error => { figure.textContent = error.message; artifactCache.delete(artifact.id); });
  }
}
function renderResult() {
  const run = state.selected;
  if (!run) { $('result').replaceChildren(); $('tool-records').replaceChildren(); displayedRun = null; blockNodes.clear(); toolNodes.clear(); $('copy').disabled = true; copiedText = ''; return; }
  if (displayedRun !== run.id) {
    displayedRun = run.id; blockNodes.clear(); toolNodes.clear(); $('tool-records').replaceChildren(); followOutput = true;
    $('result').innerHTML = '<div class="run-heading"><span id="run-status" class="badge"></span></div><p id="stale-input" class="callout" hidden>Input changed since this run.</p><div id="solution-stream"></div><p id="stream-status"></p><div id="run-error" class="error" hidden></div>';
  }
  $('run-status').textContent = labels[run.status]; $('run-status').className = 'badge ' + run.status;
  $('stale-input').hidden = !state.isStale(input()); $('run-error').hidden = !run.error; $('run-error').textContent = run.error?.message || '';
  let blocks = run.blocks || [];
  if (!blocks.length && run.result?.markdown) blocks = [{ id: 'answer', kind: 'text', text: run.result.markdown, status: 'completed' }];
  copiedText = blocks.filter(b => b.kind === 'text').map(b => b.text).join('\n\n'); $('copy').disabled = !copiedText;
  for (const block of blocks) {
    let entry = blockNodes.get(block.id);
    if (!entry) {
      const node = document.createElement('section'); node.dataset.blockId = block.id;
      if (block.kind === 'tool') node.className = 'visual-results';
      else { node.className = 'stream-message'; node.innerHTML = '<small class="stream-compatibility"></small><div class="markdown-result"></div>'; }
      $('solution-stream').append(node); entry = { node }; blockNodes.set(block.id,entry);
    }
    if (block.kind === 'text') {
      if (entry.text !== block.text) { entry.node.querySelector('.markdown-result').innerHTML = markdown(block.text); entry.text = block.text; }
      entry.node.querySelector('.stream-compatibility').textContent = block.compatibility || ''; entry.node.hidden = !block.text && !block.compatibility;
    } else renderVisuals(run,block,entry.node);
  }
  $('stream-status').textContent = run.result?.truncated ? 'Output limit reached; answer may be incomplete.' : ['queued','understanding','explaining'].includes(run.status) ? (copiedText ? 'Generating…' : 'Analyzing…') : ['solving','verifying'].includes(run.status) ? 'Computing…' : '';
  if (followOutput) { scrollPane.scrollTop = scrollPane.scrollHeight; $('jump-latest').hidden = true; }
}
function formatUsage(usage) {
  if (!usage) return '';
  const input = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? usage.input;
  const output = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? usage.output;
  return [input === undefined ? '' : input + ' input tokens', output === undefined ? '' : output + ' output tokens'].filter(Boolean).join(' / ');
}
function renderActivity() {
  const run = state.selected, tools = (run?.blocks || []).filter(b=>b.kind==='tool'), messages = (run?.blocks || []).filter(b=>b.kind==='text');
  const running = tools.find(t=>t.status==='running');
  $('run-details-title').textContent = 'Run details' + (run ? ' · ' + tools.length + ' calls' + (running ? ' · ' + running.name + ' running' : '') : '');
  $('activity-summary').textContent = run ? labels[run.status] + ' · ' + ((new Date(run.finishedAt || Date.now()) - new Date(run.createdAt)) / 1000).toFixed(1) + ' s' : 'No run selected.';
  $('run-metadata').replaceChildren();
  if (run) {
    const rows = [['Run',run.id],['Model',(run.settings?.provider || '') + ' / ' + (run.settings?.model || '')],['Started',new Date(run.createdAt).toLocaleString()],['Messages',messages.length],['Tools',tools.filter(t=>t.status==='completed').length+' completed / '+tools.filter(t=>['failed','cancelled','timed_out'].includes(t.status)).length+' failed or stopped'],['Output',run.textBytes+' bytes'],['Artifacts',tools.reduce((n,t)=>n+(t.output?.artifacts?.length||0),0)]];
    const usage=messages.map(b=>formatUsage(b.usage)).filter(Boolean);if(usage.length)rows.push(['Model usage',usage.join('; ')]);
    for(const dataset of run.datasets||[])rows.push(['Dataset',dataset.name+' · '+dataset.rows+' rows · SHA-256 '+dataset.sha256]);
    const list=document.createElement('dl');for(const [name,value] of rows){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=String(value);list.append(dt,dd)}$('run-metadata').append(list);
  }
  for(const tool of tools){
    let entry=toolNodes.get(tool.id);
    if(!entry){const node=document.createElement('details');node.className='tool-record';node.innerHTML='<summary></summary><div class="tool-summary"></div><ol class="tool-stages"></ol><details><summary>Parameters</summary><pre class="tool-input"></pre></details><details><summary>Full result</summary><pre class="tool-output"></pre></details>'; $('tool-records').append(node);entry={node};toolNodes.set(tool.id,entry);}
    const out=tool.output,elapsed=out?.diagnostics?.elapsedMs??(Date.now()-new Date(tool.startedAt));
    entry.node.querySelector('summary').textContent=tool.name+' · '+(tool.operation||'evaluate')+' · '+(labels[tool.status]||tool.status)+' · '+(elapsed/1000).toFixed(2)+' s';
    const signature=JSON.stringify([tool.input,out,tool.progressEvents]);
    if(entry.signature!==signature){entry.signature=signature;const summary=entry.node.querySelector('.tool-summary');summary.replaceChildren();
      const facts=[['Operation',tool.operation||'evaluate'],['Budget',(tool.limits?.timeoutMs||5000)/1000+' s'],['Status',tool.status]];
      if(out){facts.push(['Result',JSON.stringify(out.result)],['Engine',out.diagnostics?.engine||'exact-linear/1'],['Verification',(out.verification?.status||'not_checked')+' · '+(out.verification?.scope||'')]);
        for(const check of out.verification?.checks||[])facts.push([check.name,check.passed?'Passed':'Failed']);
        for(const [name,value] of Object.entries(out.diagnostics||{}))facts.push([name,typeof value==='object'?JSON.stringify(value):value]);
        for(const assumption of out.assumptions||[])facts.push(['Assumption',assumption]);for(const warning of out.warnings||[])facts.push(['Warning',warning]);if(out.error)facts.push(['Error',out.error.code+': '+out.error.message]);
      }
      const dl=document.createElement('dl');for(const [name,value] of facts){const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=name;dd.textContent=String(value??'').slice(0,4000);dl.append(dt,dd)}summary.append(dl);
      const stages=entry.node.querySelector('.tool-stages');stages.replaceChildren();for(const stage of tool.progressEvents||[]){const li=document.createElement('li');li.textContent=((new Date(stage.timestamp)-new Date(tool.startedAt))/1000).toFixed(2)+' s · '+stage.message;stages.append(li)}
      entry.node.querySelector('.tool-input').textContent=JSON.stringify(tool.input,null,2);entry.node.querySelector('.tool-output').textContent=out?JSON.stringify(out,null,2):'Waiting for result…';
    }
  }
  $('events').replaceChildren();for(const event of run?.events||[]){const li=document.createElement('li'),time=document.createElement('time'),body=document.createElement('div');time.textContent=((new Date(event.timestamp)-new Date(run.createdAt))/1000).toFixed(2)+' s';body.textContent=(labels[event.stage]||event.stage)+' · '+event.message;li.append(time,body);$('events').append(li)}
}
function render() { renderControls(); renderHistory(); renderResult(); renderActivity(); }
let renderTimer;
function scheduleRender() { if (!renderTimer) renderTimer = setTimeout(() => { renderTimer = null; render(); }, 40); }
window.workspace.onRun(run => { if (state.receive(run)) scheduleRender(); });
const recovering = new Set(), pending = new Map();
async function recover(runId) {
  if (recovering.has(runId)) return; recovering.add(runId);
  try {
    state.receive(await command('get', runId));
    const patches = pending.get(runId) || []; pending.delete(runId);
    for (const patch of patches.sort((a,b) => a.revision - b.revision)) if (state.delta(patch) === 'gap') { const queue = pending.get(runId) || []; queue.push(patch); pending.set(runId, queue); }
    scheduleRender();
  } catch (error) { notice(error.message); pending.delete(runId); }
  finally { recovering.delete(runId); if (pending.has(runId)) setTimeout(() => recover(runId), 100); }
}
window.workspace.onDelta(patch => {
  const outcome = state.delta(patch);
  if (outcome === 'applied') scheduleRender();
  else if (outcome === 'gap') { const queue = pending.get(patch.runId) || []; if (queue.length < 10000) queue.push(patch); pending.set(patch.runId, queue); recover(patch.runId); }
});
async function start(request = { input: input(), datasetIds: attachments.map(item=>item.id) }) {
  if (state.busy || starting || settingsBusy) return;
  starting = true; renderControls(); notice('');
  try { const run = await command('start', request); state.receive(run); state.selectedId = run.id; showSolution(); $('activity').open = false; }
  catch (error) { notice(error.message); }
  finally { starting = false; render(); }
}
$('solve').onclick = () => start();
$('retry').onclick = () => { const run = state.selected; if (run) start({ input: run.input, parentId: run.id, datasetIds: run.datasetIds || [] }); };
async function stop() { try { await command('cancel', state.activeId); } catch (error) { notice(error.message); } }
$('stop').onclick = stop; $('activity-stop').onclick = stop;
$('new').onclick = () => { state.selectedId = null; attachments = []; renderAttachments(); showSolution(false); editor.setMarkdown(''); editor.focus(); notice(''); render(); };
$('clear').onclick = async () => { try { await command('clear'); state.runs.clear(); artifactCache.clear(); attachments=[]; renderAttachments(); state.selectedId = null; showSolution(false); render(); notice('Session history cleared.'); } catch (error) { notice(error.message); } };
$('copy').onclick = async () => { try { await navigator.clipboard.writeText(copiedText); notice('Result copied as Markdown.'); } catch { notice('Clipboard unavailable. Select the result and use the copy shortcut.'); } };
setInterval(() => { if (state.busy && !$('solution-pane').hidden) renderActivity(); }, 500);
$('shortcut').textContent = window.workspace.platform === 'darwin' ? '⌘ Enter' : 'Ctrl Enter';
document.addEventListener('keydown', event => {
  if ((event.ctrlKey || event.metaKey) && event.key === 'Enter' && !event.isComposing && !document.querySelector('dialog[open]')) { event.preventDefault(); start(); }
});
function settingsValue() {
  const draft = { provider: $('provider').value, baseUrl: $('base-url').value, apiKey: $('api-key').value, model: $('model').value, maxTokens: Number($('max-tokens').value) };
  draft.keepApiKey = Boolean(!draft.apiKey && appliedSettings?.hasKey && draft.provider === appliedSettings.provider && draft.baseUrl === appliedSettings.baseUrl);
  return draft;
}
function fillSettings(value) {
  $('provider').value = value?.provider || Object.keys(presets)[0];
  $('base-url').value = value?.baseUrl || presets[$('provider').value].baseUrl;
  $('model').value = value?.model || ''; $('api-key').value = ''; $('max-tokens').value = value?.maxTokens || 4096;
  $('api-key').placeholder = value?.hasKey ? 'Existing session key will be kept' : 'Optional for local services';
  $('token-field').hidden = ['openai-compatible', 'deepseek'].includes($('provider').value);
  $('model-list').replaceChildren(); $('settings-status').textContent = '';
}
$('settings-button').onclick = () => { fillSettings(appliedSettings); openPanel('settings'); };
$('close-settings').onclick = () => { if (!settingsBusy) $('settings').close(); };
$('settings').addEventListener('cancel', event => { if (settingsBusy) event.preventDefault(); });
$('settings').addEventListener('close', () => { $('api-key').value = ''; });
$('provider').onchange = () => fillSettings({ provider: $('provider').value, baseUrl: presets[$('provider').value].baseUrl });
$('base-url').oninput = () => { $('api-key').value = ''; $('api-key').placeholder = 'Enter a key for this endpoint'; $('model-list').replaceChildren(); };
function setSettingsBusy(value) {
  settingsBusy = value;
  for (const id of ['provider', 'base-url', 'api-key', 'model', 'max-tokens', 'load-models', 'test', 'apply', 'close-settings']) $(id).disabled = value;
  $('cancel-settings-request').hidden = !value; renderControls();
}
async function settingsOperation(kind) {
  setSettingsBusy(true); $('settings-status').textContent = kind === 'test' ? 'Testing draft settings…' : 'Loading models…';
  try {
    const result = await command(kind, settingsValue());
    if (kind === 'models') { $('model-list').replaceChildren(...result.map(id => { const option = document.createElement('option'); option.value = id; return option; })); $('settings-status').textContent = result.length + ' models loaded. Select or enter a model ID.'; }
    else $('settings-status').textContent = 'Connection succeeded. Select Apply to use these settings.';
  } catch (error) { $('settings-status').textContent = error.message; }
  finally { setSettingsBusy(false); }
}
$('load-models').onclick = () => settingsOperation('models'); $('test').onclick = () => settingsOperation('test');
$('cancel-settings-request').onclick = () => command('cancel', 'settings').catch(error => { $('settings-status').textContent = error.message; });
$('settings-form').onsubmit = async event => {
  event.preventDefault();
  try { appliedSettings = await command('configure', settingsValue()); $('connection').textContent = appliedSettings.model; $('settings').close(); notice('AI settings applied for this session.'); }
  catch (error) { $('settings-status').textContent = error.message; }
};
command('bootstrap').then(data => {
  presets = data.presets; appliedSettings = data.settings;
  if (appliedSettings) $('connection').textContent = appliedSettings.model;
  for (const [id, value] of Object.entries(presets)) { const option = document.createElement('option'); option.value = id; option.textContent = value.label; $('provider').append(option); }
  for (const run of data.runs) state.receive(run);
  render();
}).catch(error => notice(error.message));
