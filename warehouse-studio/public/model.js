const HOURS_PER_UNIT = Object.freeze({ hour: 1, day: 24, week: 168 });
const HOUR_MS = 60 * 60 * 1000;
const numberFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6,
});

// Treat datetime-local values as wall-clock time: calculations do not change
// with the machine's time zone or daylight-saving transitions.
function parseDateTime(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }
  const date = new Date(0);
  date.setUTCFullYear(year, month - 1, day);
  date.setUTCHours(hour, minute, 0, 0);
  if (
    date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day || date.getUTCHours() !== hour || date.getUTCMinutes() !== minute
  ) return null;
  return date.getTime();
}

function nonnegativeNumber(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

// Nine decimal places keep ordinary stock arithmetic stable (e.g. 0.1 * 3)
// without converting the saved source data to a formatted display string.
function roundQuantity(value) {
  if (!Number.isFinite(value)) return null;
  const rounded = Number(value.toFixed(9));
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function durationHours(period) {
  const start = parseDateTime(period?.start);
  const end = parseDateTime(period?.end);
  if (start === null || end === null || end <= start) return null;
  const duration = (end - start) / HOUR_MS;
  return Number.isFinite(duration) && duration > 0 ? duration : null;
}

export function requirements(item, period) {
  const rate = item?.mode === 'rate';
  const fixed = item?.mode === 'fixed';
  const unitHours = HOURS_PER_UNIT[item?.rateUnit];
  const amountValid = nonnegativeNumber(item?.amount);
  const stockValid = nonnegativeNumber(item?.stock);
  const configured = amountValid && (fixed || (rate && item.amount > 0 && typeof unitHours === 'number'));
  const coverageHours = rate && configured && stockValid
    ? roundQuantity((item.stock / item.amount) * unitHours)
    : null;
  const hours = durationHours(period);
  const required = configured && hours !== null
    ? roundQuantity(fixed ? item.amount : item.amount * (hours / unitHours))
    : null;
  const legacySupply = item && ['supplyMode', 'supplyAmount', 'supplyRateUnit'].every((key) => item[key] === undefined);
  const supplyMode = legacySupply ? 'fixed' : item?.supplyMode;
  const supplyAmount = legacySupply ? 0 : item?.supplyAmount;
  const supplyUnitHours = HOURS_PER_UNIT[legacySupply ? 'day' : item?.supplyRateUnit];
  const supplied = hours !== null && nonnegativeNumber(supplyAmount) && (supplyMode === 'fixed' || (supplyMode === 'rate' && supplyUnitHours))
    ? roundQuantity(supplyMode === 'fixed' ? supplyAmount : supplyAmount * (hours / supplyUnitHours))
    : null;
  const available = stockValid && supplied !== null ? roundQuantity(item.stock + supplied) : null;
  const remaining = required !== null && available !== null ? roundQuantity(available - required) : null;
  return {
    required,
    supplied,
    available,
    shortage: remaining === null ? null : Math.max(-remaining, 0),
    remaining,
    coverageHours,
    configured,
  };
}

export function formatNumber(value) {
  return typeof value === 'number' && Number.isFinite(value)
    ? numberFormatter.format(Object.is(value, -0) ? 0 : value)
    : '—';
}

export function shiftDays(datetime, days) {
  const timestamp = parseDateTime(datetime);
  if (timestamp === null || !Number.isSafeInteger(days)) return null;
  const shifted = new Date(timestamp + days * 24 * HOUR_MS);
  const year = shifted.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) return null;
  return shifted.toISOString().slice(0, 16);
}

export function endAfterDays(datetime, days) {
  const timestamp = parseDateTime(datetime);
  if (timestamp === null || !Number.isFinite(days) || days <= 0 || days > 36600) return null;
  const minutes = Math.round(days * 24 * 60);
  if (minutes < 1) return null;
  const end = new Date(timestamp + minutes * 60000);
  const year = end.getUTCFullYear();
  if (!Number.isFinite(year) || year < 1 || year > 9999) return null;
  return end.toISOString().slice(0, 16);
}

export function typeSegments(type) {
  const parts = type.split('/').map((part) => part.trim()).filter(Boolean);
  return parts.length ? parts : [type.trim()];
}

export function matchesType(type, selected) {
  if (!selected) return true;
  const parts = typeSegments(type);
  return typeSegments(selected).every((part, index) => parts[index] === part);
}

export function typeFilterState(items, selected = '') {
  const root = { path: '', count: items.length, children: new Map() };
  for (const item of items) {
    let node = root;
    for (const label of typeSegments(item.type)) {
      if (!node.children.has(label)) {
        node.children.set(label, { label, path: node.path ? `${node.path} / ${label}` : label, count: 0, children: new Map() });
      }
      node = node.children.get(label);
      node.count++;
    }
  }
  const selection = selected ? typeSegments(selected) : [];
  const levels = [];
  let node = root;
  let depth = 0;
  while (node === root || node.children.size) {
    const child = node.children.get(selection[depth]);
    levels.push({
      parent: node.path, count: node.count, value: child?.path || node.path,
      options: [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label, 'en-US'))
        .map(({ label, path, count }) => ({ label, path, count })),
    });
    if (!child) break;
    node = child;
    depth++;
  }
  return { selected: node.path, levels };
}

export function stockVisualization(stock, required) {
  if (!nonnegativeNumber(stock) || !nonnegativeNumber(required)) return null;
  const scale = Math.max(stock, required);
  return {
    covered: scale ? Math.min(stock, required) / scale * 100 : 0,
    missing: scale ? Math.max(required - stock, 0) / scale * 100 : 0,
    surplus: scale ? Math.max(stock - required, 0) / scale * 100 : 0,
    target: scale ? required / scale * 100 : 0,
    balance: roundQuantity(stock - required),
    status: scale === 0 ? 'empty' : stock < required ? 'shortage' : stock > required ? 'surplus' : 'ready',
  };
}

// History stores warehouse content only. Server revisions must always advance,
// including when an old content snapshot is saved again by undo or redo.
export class EditHistory {
  constructor({ limit = 100, maxBytes = 16 * 1024 * 1024 } = {}) {
    this.limit = limit;
    this.maxBytes = maxBytes;
    this.reset([]);
  }

  reset(value) {
    this.present = JSON.stringify(value);
    this.past = [];
    this.future = [];
    this.breakGroup();
  }

  breakGroup() { this.group = null; }
  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  record(value, { group = null, ...context } = {}) {
    const next = JSON.stringify(value);
    if (next === this.present) return false;
    if (!group || group !== this.group || !this.past.length) {
      this.past.push({ value: this.present, context: { ...context } });
    }
    this.present = next;
    this.future = [];
    this.group = group;
    let bytes = this.past.reduce((sum, entry) => sum + entry.value.length * 2, 0);
    while (this.past.length > 1 && (this.past.length > this.limit || bytes > this.maxBytes)) {
      bytes -= this.past.shift().value.length * 2;
    }
    return true;
  }

  move(from, to) {
    this.breakGroup();
    const entry = from.pop();
    if (!entry) return null;
    to.push({ value: this.present, context: { ...entry.context } });
    this.present = entry.value;
    return { value: JSON.parse(entry.value), context: { ...entry.context } };
  }

  undo() { return this.move(this.past, this.future); }
  redo() { return this.move(this.future, this.past); }
}
