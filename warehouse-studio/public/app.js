import { HOURS_PER_UNIT, endAfterDuration, durationHours, requirements, formatNumber, shiftDays, stockVisualization, typeSegments, matchesType, typeFilterState, stepQuantity, reorderItems, EditHistory } from './model.js';

const $ = (id) => document.getElementById(id);
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let state;
let activeWarehouse;
let activeType = '';
let query = '';
let shortageOnly = false;
let pending = [];
let saving = false;
let saveError = null;
let revision = 0;
let lastSaved = '';
let invalidPeriod = false;
let confirmAction;
let toastTimer;
let typeTarget = null;
let unitTarget = null;
let draggedItem = null;
const warehouse = () => state.warehouses.find((w) => w.id === activeWarehouse);
const calculationPeriod = () => invalidPeriod ? null : warehouse().period;
const clone = (value) => JSON.parse(JSON.stringify(value));
const history = new EditHistory();

function toast(message) {
  $('toast').textContent = message;
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 2800);
}

function updateSaveStatus() {
  const el = $('save-status');
  el.className = saveError ? 'failed' : pending.length || saving ? 'saving' : '';
  el.textContent = saveError ? 'Save failed · Unsaved changes' : pending.length || saving ? 'Saving to JSON…' : `Saved to JSON${lastSaved ? ` · ${new Date(lastSaved).toLocaleTimeString('en-US', { hour12: false })}` : ''}`;
  $('error-banner').hidden = !saveError;
  if (saveError) $('error-message').textContent = saveError.message;
  $('retry-save').hidden = !state || saveError?.conflict;
  $('download-recovery').hidden = !state;
}

function updateHistoryControls() {
  $('undo-edit').disabled = !history.canUndo;
  $('redo-edit').disabled = !history.canRedo;
}

function changed(context = {}) {
  history.record(state.warehouses, { warehouseId: activeWarehouse, ...context });
  updateHistoryControls();
  queueSave();
}

function queueSave() {
  const snapshot = clone(state);
  // Keep the request already in flight, then only the latest complete state.
  // A corrected value must not stay blocked behind an older rejected snapshot.
  if (saving) pending.splice(1, pending.length, snapshot);
  else pending = [snapshot];
  updateSaveStatus();
  void saveNext();
}

async function saveNext() {
  if (saving || saveError || !pending.length) return;
  saving = true;
  updateSaveStatus();
  try {
    while (pending.length) {
      const snapshot = pending[0];
      const response = await fetch('/api/state', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...snapshot, revision }),
      });
      const body = await response.json();
      if (!response.ok) {
        const error = new Error(response.status === 409 ? 'Another window changed the saved data. Export your unsaved changes, then reload before editing again.' : `Save failed: ${body.error || response.statusText}`);
        error.conflict = response.status === 409;
        throw error;
      }
      revision = body.revision;
      state.revision = revision;
      state.updatedAt = body.updatedAt;
      lastSaved = body.updatedAt;
      pending.shift();
    }
  } catch (error) {
    saveError = { message: error.message.startsWith('Save failed') || error.conflict ? error.message : 'Cannot connect to the local server. Your changes are still in this page. Restart the server, then retry saving.', conflict: Boolean(error.conflict) };
  } finally {
    saving = false;
    updateSaveStatus();
  }
}

async function loadState() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Could not load data');
    state = body;
    for (const w of state.warehouses) for (const item of w.items) {
      if (!Object.prototype.hasOwnProperty.call(item, 'supplyMode')) Object.assign(item, { supplyMode: 'fixed', supplyAmount: 0, supplyRateUnit: 'day' });
    }
    history.reset(state.warehouses);
    updateHistoryControls();
    revision = body.revision;
    lastSaved = body.updatedAt;
    if (!state.warehouses.some((w) => w.id === activeWarehouse)) activeWarehouse = state.warehouses[0].id;
    pending = [];
    saveError = null;
    $('loading').hidden = true;
    $('workspace').hidden = false;
    $('warehouse-settings').disabled = false;
    $('export-json').disabled = false;
    $('export-pdf').disabled = false;
    renderWarehouse();
    updateSaveStatus();
  } catch (error) {
    $('loading').textContent = 'Could not load your warehouses. Check that the local server is running, then reload.';
    saveError = { message: `Could not load data: ${error.message}`, conflict: false };
    updateSaveStatus();
  }
}

function renderWarehouses() {
  $('warehouse-select').innerHTML = state.warehouses.map((w) => `<option value="${escapeHtml(w.id)}">${escapeHtml(w.name)}</option>`).join('');
  $('warehouse-select').value = activeWarehouse;
  $('warehouse-select').disabled = false;
}

function itemTypeOptions(selected) {
  const types = [...new Set(warehouse().items.map((item) => item.type))].sort((a, b) => a.localeCompare(b, 'en-US'));
  return types.map((type) => `<option value="${escapeHtml(type)}" ${selected === type ? 'selected' : ''}>${escapeHtml(type)}</option>`).join('') + '<option value="">+ New type…</option>';
}

function itemUnitOptions(selected) {
  const units = [...new Set(['pcs', 'set', 'pair', 'g', 'kg', 'ml', 'L', 'kWh', 'm', 'roll', 'pack', 'box', 'bottle', 'bundle', 'site', ...warehouse().items.map((item) => item.unit), selected])];
  return units.map((unit) => `<option value="${escapeHtml(unit)}" ${unit === selected ? 'selected' : ''}>${escapeHtml(unit)}</option>`).join('') + '<option value="">+ New unit…</option>';
}

function renderUnits() {
  const byId = new Map(warehouse().items.map((item) => [item.id, item]));
  $('items').querySelectorAll('select[data-field=unit]').forEach((select) => {
    const item = byId.get(select.closest('tr').dataset.item);
    if (item) select.innerHTML = itemUnitOptions(item.unit);
  });
}

function renderTypes() {
  const filters = typeFilterState(warehouse().items, activeType);
  activeType = filters.selected;
  const focusedLevel = $('type-filters').contains(document.activeElement) ? document.activeElement.dataset.level : null;
  $('type-filters').innerHTML = filters.levels.map((level, index) => `${index ? '<span class="type-separator" aria-hidden="true">/</span>' : ''}<select ${index === 0 ? 'id="type-filter"' : ''} class="type-level" data-level="${index}" aria-label="${index === 0 ? 'Filter by primary type' : `Filter by type level ${index + 1}`}" title="${escapeHtml(level.value || 'All types')}"><option value="${escapeHtml(level.parent)}">${index ? 'All subtypes' : 'All types'} (${level.count})</option>${level.options.map((option) => `<option value="${escapeHtml(option.path)}" ${option.path === level.value ? 'selected' : ''}>${escapeHtml(option.label)} (${option.count})</option>`).join('')}</select>`).join('');
  if (focusedLevel !== null) $('type-filters').querySelector(`[data-level="${focusedLevel}"]`)?.focus({ preventScroll: true });
  const byId = new Map(warehouse().items.map((item) => [item.id, item]));
  $('items').querySelectorAll('select[data-field=type]').forEach((select) => {
    const item = byId.get(select.closest('tr').dataset.item);
    if (item) select.innerHTML = itemTypeOptions(item.type);
  });
}

function displayPeriod() {
  const period = warehouse().period;
  $('duration-unit').value = period.durationUnit || 'day';
  $('period-start').value = period.start;
  $('period-end').value = period.end;
  invalidPeriod = false;
  $('period-error').hidden = true;
  $('period-start').removeAttribute('aria-invalid');
  $('period-end').removeAttribute('aria-invalid');
  $('duration-days').removeAttribute('aria-invalid');
  updateDuration();
}

function updateDuration(preserveInput = false) {
  const hours = durationHours(calculationPeriod());
  const days = hours === null ? null : hours / 24;
  const unit = $('duration-unit').value;
  const amount = hours === null ? null : hours / HOURS_PER_UNIT[unit];
  $('duration-days').max = String(36600 * 24 / HOURS_PER_UNIT[unit]);
  $('duration-days').setAttribute('aria-label', `Duration in ${unit}s`);
  if (!preserveInput) $('duration-days').value = amount === null ? '' : String(Number(amount.toFixed(10)));
  $('quick-days').querySelectorAll('button').forEach((b) => {
    const selected = hours !== null && Number(b.dataset.days) === days;
    b.classList.toggle('active', selected);
    b.setAttribute('aria-pressed', String(selected));
  });
}

function renderStats() {
  const items = warehouse().items;
  const computed = items.map((i) => requirements(i, calculationPeriod()));
  const stat = (id, value) => { $(id).textContent = value; };
  stat('stat-total', items.length);
  stat('stat-rate', items.filter((i) => i.mode === 'rate' || i.supplyMode === 'rate').length);
  stat('stat-shortage', computed.filter((r) => r.shortage > 0).length);
  stat('stat-ready', computed.filter((r) => r.required !== null && r.shortage === 0).length);
  const unconfigured = computed.filter((r) => !r.configured).length;
  $('stat-unconfigured').hidden = unconfigured === 0;
  $('stat-unconfigured').textContent = `${unconfigured} ${unconfigured === 1 ? 'item needs' : 'items need'} a usage rate`;
}

function rowMarkup(item) {
  const name = escapeHtml(item.name);
  const field = (key, label, cls, attrs = '') => `<input class="cell-input ${cls}" data-field="${key}" value="${escapeHtml(item[key])}" aria-label="${name} ${label}" ${attrs}>`;
  const quantityField = (key, label, cls) => `<span class="quantity-control"><span class="quantity-stepper">${[[1, 'Increase', 'm2 6 3-3 3 3'], [-1, 'Decrease', 'm2 3 3 3 3-3']].map(([direction, action, path]) => `<button type="button" class="quantity-step" tabindex="-1" data-quantity-step="${direction}" aria-label="${action} ${name} ${label}" title="${action} by 1"><svg viewBox="0 0 10 10" aria-hidden="true"><path d="${path}"/></svg></button>`).join('')}</span>${field(key, label, cls, 'type="number" min="0" max="1000000000000" step="any" required')}</span>`;
  const rule = (supply) => {
    const [mode, amount, rateUnit] = supply ? ['supplyMode', 'supplyAmount', 'supplyRateUnit'] : ['mode', 'amount', 'rateUnit'];
    const label = supply ? 'supply' : 'demand';
    return `<div class="rule-controls"><span class="rule-mode"><select class="rule-select" data-field="${mode}" aria-label="${name} ${label} mode"><option value="rate" ${item[mode] === 'rate' ? 'selected' : ''}>Rate — quantity per time unit</option><option value="fixed" ${item[mode] === 'fixed' ? 'selected' : ''}>Fixed — total quantity</option></select><span class="rule-mode-symbol" aria-hidden="true">${item[mode] === 'fixed' ? 'ℱ' : 'ℛ'}</span></span>${quantityField(amount, `${label} amount`, 'amount-input')}<span class="rule-unit" title="${escapeHtml(item.unit)}">${escapeHtml(item.unit)}</span><select class="rate-select" data-field="${rateUnit}" aria-label="${name} ${label} time unit" ${item[mode] === 'fixed' ? 'hidden' : ''}>${[['second', '/ sec'], ['minute', '/ min'], ['hour', '/ hour'], ['day', '/ day'], ['week', '/ week']].map(([value, text]) => `<option value="${value}" ${item[rateUnit] === value ? 'selected' : ''}>${text}</option>`).join('')}</select></div>`;
  };
  return `<tr data-item="${escapeHtml(item.id)}">
    <td class="row-number"></td>
    <td>${field('name', 'name', 'item-name', 'maxlength="150" required')}</td>
    <td><select class="cell-input type-input" data-field="type" aria-label="${name} type" required>${itemTypeOptions(item.type)}</select></td>
    <td><div class="stock-fields">${quantityField('stock', 'stock', 'stock-input')}<select class="cell-input unit-input" data-field="unit" aria-label="${name} unit" required>${itemUnitOptions(item.unit)}</select></div></td>
    <td class="supply-cell">${rule(true)}</td>
    <td>${rule(false)}</td>
    <td class="balance-cell"></td>
    <td><div class="row-actions"><button class="icon-button row-details" data-details="${escapeHtml(item.id)}" aria-label="Details for ${name}" title="Material details"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6zM14 3v5h5M9 12h7M9 16h7"/></svg></button><button class="icon-button row-drag" draggable="true" data-drag="${escapeHtml(item.id)}" aria-label="Reorder ${name}" aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown" title="Drag to reorder · Alt+↑ / Alt+↓"><svg class="icon" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01"/></svg></button><button class="icon-button row-delete" data-delete="${escapeHtml(item.id)}" aria-label="Delete ${name}" title="Delete item">×</button></div></td>
  </tr>`;
}

function updateRow(row, item, ordinal) {
  row.querySelector('.row-number').textContent = String(ordinal);
  row.querySelector('[data-details]').setAttribute('aria-label', `Details for ${item.name}`);
  const result = requirements(item, calculationPeriod());
  const labels = { name: 'name', note: 'note', type: 'type', stock: 'stock', unit: 'unit', mode: 'demand mode', amount: 'demand amount', rateUnit: 'demand time unit', supplyMode: 'supply mode', supplyAmount: 'supply amount', supplyRateUnit: 'supply time unit' };
  row.querySelectorAll('[data-field]').forEach((input) => {
    input.setAttribute('aria-label', `${item.name} ${labels[input.dataset.field]}`);
    if (['name', 'note', 'type', 'unit'].includes(input.dataset.field) && input.getAttribute('aria-invalid') !== 'true') input.title = item[input.dataset.field];
  });
  row.querySelector('[data-delete]').setAttribute('aria-label', `Delete ${item.name}`);
  row.querySelector('[data-drag]').setAttribute('aria-label', `Reorder ${item.name}`);
  row.querySelectorAll('.quantity-control').forEach((control) => {
    const input = control.querySelector('input');
    control.querySelectorAll('[data-quantity-step]').forEach((button) => {
      const increasing = button.dataset.quantityStep === '1';
      button.setAttribute('aria-label', `${increasing ? 'Increase' : 'Decrease'} ${input.getAttribute('aria-label')}`);
      button.disabled = increasing ? item[input.dataset.field] >= 1e12 : item[input.dataset.field] <= 0;
    });
  });
  row.querySelectorAll('.rule-unit').forEach((unit) => { unit.textContent = item.unit; unit.title = item.unit; });
  row.querySelectorAll('.rule-select').forEach((select) => {
    select.nextElementSibling.textContent = item[select.dataset.field] === 'fixed' ? 'ℱ' : 'ℛ';
  });
  row.querySelector('[data-field=rateUnit]').hidden = item.mode === 'fixed';
  row.querySelector('[data-field=supplyRateUnit]').hidden = item.supplyMode === 'fixed';
  row.querySelector('.supply-cell').title = result.supplied === null ? 'Select a valid period to calculate planned supply.' : `Planned supply for this interval: ${formatNumber(result.supplied)} ${item.unit}.`;
  const visual = stockVisualization(result.available, result.required);
  const totals = `Stock: ${formatNumber(item.stock)} ${item.unit}; planned supply: ${formatNumber(result.supplied)} ${item.unit}; available: ${formatNumber(result.available)} ${item.unit}; required: ${formatNumber(result.required)} ${item.unit}`;
  const description = visual ? `${totals}; ${visual.balance < 0 ? 'shortfall' : 'surplus'}: ${formatNumber(Math.abs(visual.balance))} ${item.unit}. Green: covered demand; striped red: shortfall; pale green: surplus; black marker: requirement. Balance is projected at the end of the interval.` : `${totals}; ${invalidPeriod ? 'invalid period' : 'set a usage rate to compare with demand'}.`;
  const demandHint = invalidPeriod ? 'Select a valid period to calculate requirements.' : !result.configured ? 'Set a usage rate greater than 0 to calculate requirements.' : item.mode === 'rate' ? `${item.amount} ${item.unit} per ${item.rateUnit} × selected duration; stock covers ${formatNumber(result.coverageHours === null ? null : result.coverageHours / 24)} days.` : 'Fixed requirements do not change with the selected period.';
  const ratio = `<span class="stock-ratio" title="${escapeHtml(`Supply / Required: ${formatNumber(result.supplied)} / ${formatNumber(result.required)} ${item.unit} for this interval. ${demandHint}`)}" aria-hidden="true">(${formatNumber(result.supplied)}/${formatNumber(result.required)})</span>`;
  const delta = !visual ? '—' : visual.status === 'empty' ? '—' : visual.balance < 0 ? `−${formatNumber(-visual.balance)}` : visual.balance > 0 ? `+${formatNumber(visual.balance)}` : 'Ready';
  row.querySelector('.balance-cell').innerHTML = `<div class="stock-visual ${visual?.status || 'unknown'}" role="img" tabindex="0" aria-label="${escapeHtml(`${item.name}. ${description}`)}" title="${escapeHtml(description)}"><div class="stock-meter" aria-hidden="true">${visual ? `<span class="stock-covered" style="width:${visual.covered}%"></span><span class="stock-missing" style="width:${visual.missing}%"></span><span class="stock-surplus" style="width:${visual.surplus}%"></span>${visual.status !== 'empty' && result.required > 0 ? `<span class="stock-target" style="left:${visual.target}%"></span>` : ''}` : ''}</div><span class="stock-delta" aria-hidden="true">${delta}</span>${ratio}</div>`;
}

function visibleItems() {
  const search = query.trim().toLocaleLowerCase('en-US');
  return warehouse().items.filter((i) => matchesType(i.type, activeType) && (!search || `${i.name} ${i.type}`.toLocaleLowerCase('en-US').includes(search)) && (!shortageOnly || requirements(i, calculationPeriod()).shortage > 0));
}

function moveItem(itemId, targetId, placement) {
  const w = warehouse();
  const next = reorderItems(w.items, itemId, targetId, placement);
  if (next === w.items) return;
  w.items = next;
  changed({ label: 'Reorder material', itemId, reorder: true });
  renderItems();
  const row = [...$('items').rows].find((entry) => entry.dataset.item === itemId);
  row?.querySelector('[data-drag]').focus({ preventScroll: true });
  toast('Material order updated');
}

function clearDropMarkers() {
  $('items').querySelectorAll('.drop-before, .drop-after').forEach((row) => row.classList.remove('drop-before', 'drop-after'));
}

function endRowDrag() {
  draggedItem = null;
  clearDropMarkers();
  $('items').querySelector('.dragging')?.classList.remove('dragging');
}

function rowDropTarget(event) {
  if (!draggedItem || draggedItem.warehouseId !== activeWarehouse) return null;
  const row = event.target.closest('tr[data-item]');
  if (!row || !$('items').contains(row) || row.dataset.item === draggedItem.itemId) return null;
  const bounds = row.getBoundingClientRect();
  return { row, placement: event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after' };
}

function renderItems(preserveEditing = false) {
  const matches = visibleItems();
  const focusedRow = preserveEditing && $('items').contains(document.activeElement) ? document.activeElement.closest('tr') : null;
  const ids = new Set(matches.map((item) => item.id));
  if (focusedRow) ids.add(focusedRow.dataset.item);
  const items = warehouse().items.filter((item) => ids.has(item.id));
  if (!focusedRow) $('items').innerHTML = items.map(rowMarkup).join('');
  else {
    // Reuse existing rows so typing, selection and composition keep their focus.
    // A row that stops matching stays visible until focus leaves that row.
    const rows = new Map([...$('items').querySelectorAll('tr')].map((row) => [row.dataset.item, row]));
    for (const [id, row] of rows) if (!ids.has(id)) row.remove();
    let nextRow = null;
    for (const item of [...items].reverse()) {
      let row = rows.get(item.id);
      if (!row) {
        const template = document.createElement('template');
        template.innerHTML = rowMarkup(item);
        row = template.content.firstElementChild;
        $('items').insertBefore(row, nextRow);
      }
      nextRow = row;
    }
  }
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordinals = new Map(warehouse().items.map((item, index) => [item.id, index + 1]));
  $('items').querySelectorAll('tr').forEach((row) => updateRow(row, byId.get(row.dataset.item), ordinals.get(row.dataset.item)));
  const retained = items.length !== matches.length;
  $('result-count').textContent = `${matches.length} / ${warehouse().items.length}${retained ? ' · Editing row retained' : ''}`;
  $('inventory-title').textContent = activeType || 'Inventory';
  $('empty-state').hidden = items.length > 0;
  const empty = warehouse().items.length === 0;
  $('empty-state').querySelector('h2').textContent = empty ? 'No items yet' : 'No matching items';
  $('empty-state').querySelector('p').textContent = empty ? 'Add your first item to start managing this warehouse.' : 'Try another search or type, or turn off the shortages filter.';
  $('empty-add').hidden = !empty;
}

function renderWarehouse() {
  renderWarehouses();
  renderTypes();
  displayPeriod();
  renderStats();
  renderItems();
}

function confirm(title, message, action, label = 'Delete') {
  $('confirm-title').textContent = title;
  $('confirm-message').textContent = message;
  $('confirm-action').textContent = label;
  confirmAction = action;
  $('confirm-dialog').showModal();
}

function download() {
  if (!state) return;
  const blob = new Blob([`${JSON.stringify(state, null, 2)}\n`], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `warehouse-${new Date().toISOString().slice(0, 10)}${pending.length ? '-unsaved' : ''}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPdf() {
  if (!state) return;
  const invalid = document.querySelector('[aria-invalid="true"]');
  if (invalidPeriod || invalid) {
    toast('Correct the invalid value before exporting.');
    (invalid || $('duration-days')).focus();
    return;
  }
  const button = $('export-pdf');
  const label = button.innerHTML;
  button.disabled = true;
  button.textContent = 'Exporting…';
  try {
    const response = await fetch('/api/export/pdf', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ warehouse: warehouse(), itemIds: visibleItems().map((item) => item.id), filters: { type: activeType, query, shortageOnly } }) });
    if (!response.ok) {
      const body = await response.json();
      throw new Error(body.error || 'Could not export PDF.');
    }
    const url = URL.createObjectURL(await response.blob());
    const link = document.createElement('a');
    link.href = url;
    link.download = /filename="([^"]+)"/.exec(response.headers.get('Content-Disposition') || '')?.[1] || 'inventory.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    toast('PDF exported');
  } catch (error) { toast(error.message === 'Failed to fetch' ? 'Cannot connect to the local server. Please try again.' : error.message); }
  finally { button.disabled = false; button.innerHTML = label; }
}

function showDetails(item) {
  const w = warehouse();
  const result = requirements(item, calculationPeriod());
  const quantity = (value) => value === null ? 'Not calculated' : `${formatNumber(value)} ${item.unit}`;
  const field = (label, value) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`;
  const rule = (supply) => {
    const mode = supply ? item.supplyMode : item.mode;
    const amount = supply ? item.supplyAmount : item.amount;
    const timeUnit = supply ? item.supplyRateUnit : item.rateUnit;
    const total = supply ? result.supplied : result.required;
    const hours = durationHours(calculationPeriod());
    const factor = hours === null ? null : hours / HOURS_PER_UNIT[timeUnit];
    return field('Mode', mode === 'rate' ? 'Rate' : 'Fixed') + field(mode === 'rate' ? 'Rate' : 'Quantity', `${quantity(amount)}${mode === 'rate' ? ` / ${timeUnit}` : ''}`)
      + (mode === 'rate' ? field('Calculation', total === null ? 'Not calculated' : `${formatNumber(amount)} × ${formatNumber(factor)} = ${quantity(total)}`) : '')
      + field(supply ? 'Planned supply' : 'Required', quantity(total));
  };
  $('details-title').textContent = item.name;
  $('details-number').textContent = `No. ${w.items.indexOf(item) + 1}`;
  $('details-content').innerHTML = `<dl class="detail-list">${field('Warehouse', w.name)}${field('Type', item.type)}${field('Unit', item.unit)}${field('Current stock', quantity(item.stock))}${field('Interval', invalidPeriod ? 'Invalid interval' : `${w.period.start.replace('T', ' ')} → ${w.period.end.replace('T', ' ')}`)}${field('Duration', invalidPeriod ? 'Not calculated' : `${formatNumber(durationHours(w.period) / HOURS_PER_UNIT[w.period.durationUnit || 'day'])} ${w.period.durationUnit || 'day'}s`)}</dl>
    <div class="detail-rules"><section><h3>Supply rule</h3><dl class="detail-list">${rule(true)}</dl></section><section><h3>Demand rule</h3><dl class="detail-list">${rule(false)}</dl></section></div>
    <h3>Stock balance</h3><dl class="detail-list">${field('Available · stock + supply', quantity(result.available))}${field('Required', quantity(result.required))}${field('Shortfall', quantity(result.shortage))}${field('Net balance', quantity(result.remaining))}${field('Stock coverage', item.mode === 'fixed' ? 'Not applicable to fixed demand' : result.coverageHours === null ? 'Not calculated' : `${formatNumber(result.coverageHours / 24)} days`)}</dl>
    <h3>Notes</h3><p class="detail-note">${escapeHtml(item.note || 'No notes.')}</p>`;
  $('details-dialog').showModal();
}

function addItem() {
  if (!state) return;
  if (warehouse().items.length >= 5000 || state.warehouses.reduce((sum, w) => sum + w.items.length, 0) >= 20000) {
    toast('Item limit reached: 5,000 per warehouse and 20,000 in total.');
    return;
  }
  const item = { id: crypto.randomUUID(), name: 'New item', type: activeType || 'Uncategorized', unit: 'pcs', stock: 0, mode: 'fixed', amount: 1, rateUnit: 'day', supplyMode: 'fixed', supplyAmount: 0, supplyRateUnit: 'day', note: '' };
  warehouse().items.unshift(item);
  query = '';
  $('search').value = '';
  shortageOnly = false;
  $('only-shortage').checked = false;
  changed({ label: 'Add material', itemId: item.id, field: 'name' });
  renderWarehouses();
  renderTypes();
  renderStats();
  renderItems();
  const input = $('items').querySelector('[data-field=name]');
  input.focus();
  input.select();
}

function editPeriod(event) {
  const period = { start: $('period-start').value, end: $('period-end').value, durationUnit: $('duration-unit').value };
  const hours = durationHours(period);
  invalidPeriod = hours === null || hours > 24 * 366 * 100;
  $('period-error').hidden = !invalidPeriod;
  $('period-error').textContent = 'Enter a valid period: the end must follow the start, within 100 years. Calculations are paused and this change has not been saved.';
  $('period-start').setAttribute('aria-invalid', String(invalidPeriod));
  $('period-end').setAttribute('aria-invalid', String(invalidPeriod));
  $('duration-days').removeAttribute('aria-invalid');
  if (!invalidPeriod && (warehouse().period.start !== period.start || warehouse().period.end !== period.end)) {
    warehouse().period = period;
    changed({ label: 'Planning interval', controlId: event?.target?.id, group: event?.target?.id ? `${activeWarehouse}:${event.target.id}` : null });
  }
  updateDuration(event?.target === $('duration-days'));
  renderStats();
  renderItems();
}

function editDuration(event) {
  const input = $('duration-days');
  const end = input.checkValidity() ? endAfterDuration($('period-start').value, input.valueAsNumber, $('duration-unit').value) : null;
  if (!end) {
    invalidPeriod = true;
    input.setAttribute('aria-invalid', 'true');
    $('period-error').hidden = false;
    $('period-error').textContent = 'Enter a valid start time and a positive duration up to 36,600 days (at least one second).';
    updateDuration(true);
    renderStats(); renderItems();
    return;
  }
  $('period-end').value = end;
  editPeriod(event);
}

function fillSettings() {
  $('settings-name').value = warehouse().name;
  $('settings-description').value = warehouse().description;
  $('settings-name').removeAttribute('aria-invalid');
  $('settings-description').removeAttribute('aria-invalid');
  $('delete-warehouse').disabled = state.warehouses.length <= 1;
  $('delete-warehouse').title = state.warehouses.length <= 1 ? 'Keep at least one warehouse' : '';
}

function settings() {
  fillSettings();
  $('settings-dialog').showModal();
}

function discardInvalidDraft() {
  if ($('duration-days').getAttribute('aria-invalid') === 'true' || $('period-start').value !== warehouse().period.start || $('period-end').value !== warehouse().period.end) {
    displayPeriod(); renderStats(); renderItems();
    return true;
  }
  const input = document.activeElement;
  if (input?.getAttribute('aria-invalid') !== 'true') return false;
  const item = warehouse().items.find((entry) => entry.id === input.closest('tr')?.dataset.item);
  if (item && input.dataset.field) input.value = item[input.dataset.field];
  else if (input.id === 'settings-name') input.value = warehouse().name;
  else if (input.id === 'settings-description') input.value = warehouse().description;
  else return false;
  input.removeAttribute('aria-invalid');
  return true;
}

function travelHistory(direction) {
  if (!state || ['type-dialog', 'unit-dialog', 'confirm-dialog', 'details-dialog'].some((id) => $(id).open)) return;
  if (direction === 'undo' && discardInvalidDraft()) { toast('Restored saved value'); return; }
  const entry = history[direction]();
  if (!entry) return;
  const previousWarehouse = activeWarehouse;
  const settingsOpen = $('settings-dialog').open;
  state.warehouses = entry.value;
  const { context } = entry;
  const hasWarehouse = (id) => state.warehouses.some((w) => w.id === id);
  activeWarehouse = hasWarehouse(context.warehouseId) ? context.warehouseId : hasWarehouse(context.fallbackWarehouseId) ? context.fallbackWarehouseId : hasWarehouse(activeWarehouse) ? activeWarehouse : state.warehouses[0].id;
  if (activeWarehouse !== previousWarehouse || (context.itemId && !visibleItems().some((item) => item.id === context.itemId))) {
    activeType = ''; query = ''; shortageOnly = false;
    $('search').value = ''; $('only-shortage').checked = false;
  }
  renderWarehouse();
  if (settingsOpen) {
    if (!hasWarehouse(previousWarehouse)) $('settings-dialog').close();
    else fillSettings();
  }
  const row = [...$('items').querySelectorAll('tr')].find((element) => element.dataset.item === context.itemId);
  const focus = $('settings-dialog').open ? $(context.controlId) : context.reorder ? row?.querySelector('[data-drag]') : context.field ? row?.querySelector(`[data-field="${context.field}"]`) : $(context.controlId);
  if (focus && !focus.hidden) focus.focus({ preventScroll: true });
  updateHistoryControls();
  queueSave();
  toast(`${direction === 'undo' ? 'Undid' : 'Redid'} ${context.label || 'edit'}`);
}

document.addEventListener('focusin', () => history.breakGroup());
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && $('overview').open) {
    $('overview').open = false;
    $('overview').querySelector('summary').focus();
  }
  if ((!event.ctrlKey && !event.metaKey) || event.altKey || event.isComposing || !state) return;
  const key = event.key.toLowerCase();
  if (key !== 'z' && key !== 'y') return;
  const target = event.target;
  const editing = target instanceof Element && target.closest('input, textarea, [contenteditable=true]');
  if (editing && !editing.dataset.field && !['settings-name', 'settings-description', 'period-start', 'period-end', 'duration-days'].includes(editing.id)) return;
  if (['type-dialog', 'unit-dialog', 'confirm-dialog', 'details-dialog'].some((id) => $(id).open)) return;
  event.preventDefault();
  travelHistory(key === 'y' || event.shiftKey ? 'redo' : 'undo');
});
$('undo-edit').addEventListener('click', () => travelHistory('undo'));
$('redo-edit').addEventListener('click', () => travelHistory('redo'));
document.addEventListener('click', (event) => {
  if (!$('overview').contains(event.target)) $('overview').open = false;
});

$('warehouse-select').addEventListener('change', (event) => {
  if (!state || event.target.value === activeWarehouse) return;
  endRowDrag();
  activeWarehouse = event.target.value;
  activeType = '';
  query = '';
  shortageOnly = false;
  $('search').value = '';
  $('only-shortage').checked = false;
  renderWarehouse();
});
$('type-filters').addEventListener('change', (event) => {
  if (!event.target.matches('select[data-level]')) return;
  activeType = event.target.value;
  renderTypes();
  renderItems();
});
$('search').addEventListener('input', (event) => { query = event.target.value; renderItems(); });
$('only-shortage').addEventListener('change', (event) => { shortageOnly = event.target.checked; renderItems(); });
$('items').addEventListener('input', (event) => {
  const input = event.target;
  const field = input.dataset.field;
  if (!field || !input.closest('tr')) return;
  const row = input.closest('tr');
  const item = warehouse().items.find((i) => i.id === row.dataset.item);
  if (!item) return;
  if (event.isComposing) return;
  if (field === 'unit' && input.value === '') {
    input.value = item.unit;
    unitTarget = { warehouseId: activeWarehouse, itemId: item.id };
    $('new-unit-name').value = '';
    $('new-unit-name').setCustomValidity('');
    $('unit-dialog').showModal();
    $('new-unit-name').focus();
    return;
  }
  if (field === 'type' && input.value === '') {
    input.value = item.type;
    typeTarget = { warehouseId: activeWarehouse, itemId: item.id };
    $('new-type-name').value = '';
    $('new-type-name').setCustomValidity('');
    $('type-dialog').showModal();
    $('new-type-name').focus();
    return;
  }
  const numeric = ['stock', 'amount', 'supplyAmount'].includes(field);
  const value = numeric ? input.valueAsNumber : input.value;
  const invalid = !input.checkValidity() || (numeric ? !Number.isFinite(value) || value < 0 || value > 1e12 : value.includes('\u0000') || (['name', 'type', 'unit'].includes(field) && !value.trim()));
  input.setAttribute('aria-invalid', String(invalid));
  input.title = invalid ? 'Invalid value; not saved. Required fields cannot be blank. Quantities must be between 0 and 1 trillion.' : '';
  if (invalid || item[field] === value) return;
  item[field] = value;
  changed({ label: `Edit ${field.replace(/[A-Z]/g, (letter) => ` ${letter.toLowerCase()}`)}`, itemId: item.id, field, group: input.tagName === 'INPUT' ? `${activeWarehouse}:${item.id}:${field}` : null });
  renderStats();
  if (field === 'type') renderTypes();
  if (field === 'unit') renderUnits();
  renderItems(true);
});
$('items').addEventListener('compositionend', (event) => event.target.dispatchEvent(new Event('input', { bubbles: true })));
function adjustQuantity(input, direction) {
  if (!input || !input.checkValidity()) return;
  const next = stepQuantity(input.valueAsNumber, direction);
  if (next === null || next === input.valueAsNumber) return;
  input.value = String(next);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
$('items').addEventListener('click', (event) => {
  const button = event.target.closest('[data-quantity-step]');
  if (!button) return;
  adjustQuantity(button.closest('.quantity-control').querySelector('input'), Number(button.dataset.quantityStep));
});
$('items').addEventListener('keydown', (event) => {
  if (!event.target.matches('.quantity-control input') || event.ctrlKey || event.metaKey || event.altKey || event.isComposing || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  adjustQuantity(event.target, event.key === 'ArrowUp' ? 1 : -1);
});
$('items').addEventListener('dragstart', (event) => {
  const handle = event.target.closest('[data-drag]');
  if (!handle || !event.dataTransfer) return;
  draggedItem = { itemId: handle.dataset.drag, warehouseId: activeWarehouse };
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('text/plain', handle.dataset.drag);
  handle.closest('tr').classList.add('dragging');
});
function showRowDropTarget(event) {
  const target = rowDropTarget(event);
  clearDropMarkers();
  if (!target) {
    if (draggedItem) { event.preventDefault(); event.dataTransfer.dropEffect = 'none'; }
    return;
  }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  target.row.classList.add(`drop-${target.placement}`);
}
$('items').addEventListener('dragenter', showRowDropTarget);
$('items').addEventListener('dragover', showRowDropTarget);
$('items').addEventListener('dragleave', (event) => {
  if (!$('items').contains(event.relatedTarget)) clearDropMarkers();
});
$('items').addEventListener('drop', (event) => {
  if (draggedItem) event.preventDefault();
  const target = rowDropTarget(event);
  if (!target) { endRowDrag(); return; }
  event.preventDefault();
  const itemId = draggedItem.itemId;
  endRowDrag();
  moveItem(itemId, target.row.dataset.item, target.placement);
});
document.addEventListener('dragend', endRowDrag);
$('items').addEventListener('keydown', (event) => {
  const handle = event.target.closest('[data-drag]');
  if (!handle || !event.altKey || event.ctrlKey || event.metaKey || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const items = [...$('items').rows];
  const index = items.findIndex((row) => row.dataset.item === handle.dataset.drag);
  const before = event.key === 'ArrowUp';
  const target = items[index + (before ? -1 : 1)];
  if (target) moveItem(handle.dataset.drag, target.dataset.item, before ? 'before' : 'after');
});
$('items').addEventListener('focusout', (event) => {
  const field = event.target.dataset.field;
  const row = event.target.closest('tr');
  if (field && event.target.getAttribute('aria-invalid') === 'true') {
    const item = warehouse().items.find((i) => i.id === row?.dataset.item);
    if (item) event.target.value = item[field];
    event.target.removeAttribute('aria-invalid');
    event.target.title = '';
    toast('Invalid input was not saved. The last valid value has been restored.');
  }
  setTimeout(() => {
    if (row?.isConnected && !row.contains(document.activeElement)) renderItems(true);
  }, 0);
});
$('items').addEventListener('click', (event) => {
  const details = event.target.closest('[data-details]');
  if (details) {
    const item = warehouse().items.find((entry) => entry.id === details.dataset.details);
    if (item) showDetails(item);
    return;
  }
  const button = event.target.closest('[data-delete]');
  if (!button) return;
  const w = warehouse();
  const item = w.items.find((i) => i.id === button.dataset.delete);
  confirm('Delete item', `Delete “${item.name}” from this warehouse?`, () => {
    w.items = w.items.filter((i) => i.id !== item.id);
    changed({ label: 'Delete material', itemId: item.id, field: 'name' }); renderWarehouses(); renderTypes(); renderStats(); renderItems();
  });
});
for (const id of ['period-start', 'period-end']) $(id).addEventListener('change', editPeriod);
$('duration-unit').addEventListener('change', () => {
  if (invalidPeriod) { $('duration-unit').value = warehouse().period.durationUnit || 'day'; toast('Correct the interval before switching units.'); return; }
  warehouse().period.durationUnit = $('duration-unit').value;
  changed({ label: 'Duration unit', controlId: 'duration-unit' });
  updateDuration();
});
$('duration-days').addEventListener('input', editDuration);
$('duration-days').addEventListener('change', () => { if (!invalidPeriod) updateDuration(); });
$('quick-days').addEventListener('click', (event) => {
  const button = event.target.closest('[data-days]');
  if (!button) return;
  const end = shiftDays($('period-start').value, Number(button.dataset.days));
  if (!end) { editPeriod(); return; }
  $('period-end').value = end;
  editPeriod();
});
$('add-item').addEventListener('click', addItem);
$('empty-add').addEventListener('click', addItem);
$('warehouse-settings').addEventListener('click', settings);
$('add-warehouse').addEventListener('click', () => {
  if (!state) return;
  const previousWarehouse = activeWarehouse;
  if (state.warehouses.length >= 100) { toast('You can create up to 100 warehouses.'); return; }
  const now = new Date();
  const start = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}T00:00`;
  const w = { id: crypto.randomUUID(), name: 'New warehouse', description: '', period: { start, end: shiftDays(start, 7) }, items: [] };
  state.warehouses.push(w);
  activeWarehouse = w.id; activeType = ''; query = ''; shortageOnly = false;
  $('search').value = ''; $('only-shortage').checked = false;
  changed({ label: 'Add warehouse', fallbackWarehouseId: previousWarehouse }); renderWarehouse(); settings();
  $('settings-name').select();
});
for (const [id, field] of [['settings-name', 'name'], ['settings-description', 'description']]) {
  $(id).addEventListener('input', (event) => {
    if (event.isComposing) return;
    const valid = event.target.checkValidity() && !event.target.value.includes('\u0000') && (field !== 'name' || Boolean(event.target.value.trim()));
    event.target.setAttribute('aria-invalid', String(!valid));
    if (!valid || warehouse()[field] === event.target.value) return;
    warehouse()[field] = event.target.value;
    changed({ label: `Warehouse ${field}`, controlId: id, group: `${activeWarehouse}:${id}` }); renderWarehouses();
  });
  $(id).addEventListener('compositionend', (event) => event.target.dispatchEvent(new Event('input', { bubbles: true })));
}
$('settings-dialog').addEventListener('close', () => {
  let restored = false;
  for (const [id, field] of [['settings-name', 'name'], ['settings-description', 'description']]) {
    if ($(id).getAttribute('aria-invalid') === 'true') {
      $(id).value = warehouse()[field];
      $(id).removeAttribute('aria-invalid');
      restored = true;
    }
  }
  if (restored) toast('Invalid input was not saved. The last valid value has been restored.');
});
$('delete-warehouse').addEventListener('click', () => {
  if (state.warehouses.length <= 1) return;
  const w = warehouse();
  confirm('Delete warehouse', `Delete “${w.name}” and its ${w.items.length} ${w.items.length === 1 ? 'item' : 'items'}? Other warehouses will be kept.`, () => {
    state.warehouses = state.warehouses.filter((entry) => entry.id !== w.id);
    activeWarehouse = state.warehouses[0].id;
    activeType = '';
    $('settings-dialog').close();
    changed({ label: 'Delete warehouse', warehouseId: w.id }); renderWarehouse();
  });
});
document.querySelectorAll('[data-close]').forEach((button) => button.addEventListener('click', () => $(button.dataset.close).close()));
$('new-type-name').addEventListener('input', () => $('new-type-name').setCustomValidity(''));
$('type-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('new-type-name');
  const type = typeSegments(input.value).join(' / ');
  input.setCustomValidity(input.value.split('/').some((part) => !part.trim()) || type.includes('\u0000') || type.length > 100 ? 'Enter nonempty type levels separated by /, up to 100 characters.' : '');
  if (!input.reportValidity()) return;
  const item = state.warehouses.find((w) => w.id === typeTarget?.warehouseId)?.items.find((i) => i.id === typeTarget.itemId);
  if (item && item.type !== type) { item.type = type; changed({ label: 'Edit type', itemId: item.id, field: 'type' }); }
  $('type-dialog').close();
  renderTypes();
  renderItems();
});
$('type-dialog').addEventListener('close', () => { typeTarget = null; });
$('new-unit-name').addEventListener('input', () => $('new-unit-name').setCustomValidity(''));
$('unit-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const input = $('new-unit-name');
  const unit = input.value.trim();
  input.setCustomValidity(!unit || unit.includes('\u0000') ? 'Enter a valid unit name.' : '');
  if (!input.reportValidity()) return;
  const item = state.warehouses.find((w) => w.id === unitTarget?.warehouseId)?.items.find((i) => i.id === unitTarget.itemId);
  if (item && item.unit !== unit) { item.unit = unit; changed({ label: 'Edit unit', itemId: item.id, field: 'unit' }); }
  $('unit-dialog').close();
  renderUnits();
  renderItems();
});
$('unit-dialog').addEventListener('close', () => { unitTarget = null; });
$('confirm-action').addEventListener('click', () => { $('confirm-dialog').close(); const action = confirmAction; confirmAction = null; action?.(); });
$('export-json').addEventListener('click', download);
$('export-pdf').addEventListener('click', exportPdf);
$('download-recovery').addEventListener('click', download);
$('retry-save').addEventListener('click', () => {
  if (!state || saving || saveError?.conflict) return;
  pending = [clone(state)];
  saveError = null;
  updateSaveStatus();
  void saveNext();
});
$('reload-state').addEventListener('click', () => {
  if (saving) return;
  if (pending.length) confirm('Reload data', 'Reloading will replace unsaved changes with the saved data. Export your unsaved changes first if you want to keep them.', () => void loadState(), 'Reload');
  else void loadState();
});
window.addEventListener('beforeunload', (event) => {
  if (pending.length || saving || invalidPeriod || document.querySelector('[aria-invalid=true]')) { event.preventDefault(); event.returnValue = ''; }
});
void loadState();
