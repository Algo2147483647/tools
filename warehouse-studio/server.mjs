import http from 'node:http';
import { open, readFile, rename, mkdir, unlink, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInitialState } from './seed.mjs';
import { createInventoryPdf, pdfFilename } from './pdf.mjs';

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const MAX_BYTES = 8 * 1024 * 1024;
const MAX_QUANTITY = 1e12;
const MAX_PERIOD_MS = 36600 * 86400000;
const fileQueues = new Map();
const STATIC_FILES = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/app.js', ['app.js', 'text/javascript; charset=utf-8']],
  ['/model.js', ['model.js', 'text/javascript; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/favicon.svg', ['favicon.svg', 'image/svg+xml']],
]);

class ApiError extends Error {
  constructor(status, code, message, details = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function invalid(message) {
  throw new ApiError(400, 'VALIDATION_ERROR', message);
}

function record(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(`${label} must be an object.`);
  if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.prototype.hasOwnProperty.call(value, key))) {
    invalid(`${label} has missing or unknown fields.`);
  }
}

function string(value, max, label, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) {
    invalid(`${label} must be ${required ? 'nonempty ' : ''}text with at most ${max} characters.`);
  }
  if (value.includes('\u0000')) invalid(`${label} cannot contain null characters.`);
}

function quantity(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > MAX_QUANTITY) {
    invalid(`${label} must be a finite number between 0 and ${MAX_QUANTITY}.`);
  }
}

function dateTime(value, label) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    invalid(`${label} must use the YYYY-MM-DDTHH:mm format.`);
  }
  const ms = Date.parse(`${value}:00.000Z`);
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 16) !== value || value.startsWith('0000')) invalid(`${label} is not a valid date and time.`);
  return ms;
}

export function validateState(state) {
  record(state, ['version', 'revision', 'updatedAt', 'warehouses'], 'State');
  if (state.version !== 1) invalid('The data version must be 1.');
  if (!Number.isSafeInteger(state.revision) || state.revision < 0) {
    invalid('The revision must be a nonnegative safe integer.');
  }
  if (typeof state.updatedAt !== 'string' || !Number.isFinite(Date.parse(state.updatedAt)) ||
      new Date(state.updatedAt).toISOString() !== state.updatedAt) invalid('updatedAt must be a valid ISO timestamp.');
  if (!Array.isArray(state.warehouses) || state.warehouses.length < 1 || state.warehouses.length > 100) {
    invalid('Keep between 1 and 100 warehouses.');
  }
  const warehouseIds = new Set();
  let itemCount = 0;
  for (const warehouse of state.warehouses) {
    record(warehouse, ['id', 'name', 'description', 'period', 'items'], 'Warehouse');
    string(warehouse.id, 100, 'Warehouse ID', true);
    string(warehouse.name, 150, 'Warehouse name', true);
    string(warehouse.description, 1000, 'Warehouse description');
    if (warehouseIds.has(warehouse.id)) invalid('Warehouse IDs must be unique.');
    warehouseIds.add(warehouse.id);
    record(warehouse.period, ['start', 'end'], 'Planning interval');
    const start = dateTime(warehouse.period.start, 'Start time');
    const end = dateTime(warehouse.period.end, 'End time');
    if (end <= start || end - start > MAX_PERIOD_MS) invalid('The end must follow the start, with an interval no longer than 100 years.');
    if (!Array.isArray(warehouse.items) || warehouse.items.length > 5000) invalid('Each warehouse can contain at most 5000 items.');
    itemCount += warehouse.items.length;
    if (itemCount > 20000) invalid('The total item count cannot exceed 20000.');
    const itemIds = new Set();
    for (const item of warehouse.items) {
      const supplyKeys = ['supplyMode', 'supplyAmount', 'supplyRateUnit'];
      const hasSupply = item && supplyKeys.some((key) => Object.prototype.hasOwnProperty.call(item, key));
      record(item, ['id', 'name', 'type', 'unit', 'stock', 'mode', 'amount', 'rateUnit', 'note', ...(hasSupply ? supplyKeys : [])], 'Material');
      string(item.id, 100, 'Material ID', true);
      string(item.name, 150, 'Material name', true);
      string(item.type, 100, 'Material type', true);
      string(item.unit, 30, 'Material unit', true);
      string(item.note, 2000, 'Material note');
      if (itemIds.has(item.id)) invalid('Material IDs must be unique within a warehouse.');
      itemIds.add(item.id);
      quantity(item.stock, 'Stock');
      quantity(item.amount, 'Demand amount');
      if (!['rate', 'fixed'].includes(item.mode)) invalid('The demand mode must be rate or fixed.');
      if (!['hour', 'day', 'week'].includes(item.rateUnit)) invalid('The rate unit must be hour, day, or week.');
      if (hasSupply) {
        quantity(item.supplyAmount, 'Supply amount');
        if (!['rate', 'fixed'].includes(item.supplyMode)) invalid('The supply mode must be rate or fixed.');
        if (!['hour', 'day', 'week'].includes(item.supplyRateUnit)) invalid('The supply rate unit must be hour, day, or week.');
      }
    }
  }
  return state;
}

function serialized(dataFile, task) {
  const previous = fileQueues.get(dataFile) || Promise.resolve();
  const result = previous.catch(() => {}).then(task);
  fileQueues.set(dataFile, result);
  result.finally(() => {
    if (fileQueues.get(dataFile) === result) fileQueues.delete(dataFile);
  }).catch(() => {});
  return result;
}

async function atomicWrite(dataFile, state) {
  const content = `${JSON.stringify(state, null, 2)}\n`;
  if (Buffer.byteLength(content) > MAX_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'The formatted JSON file cannot exceed 8 MiB.');
  await mkdir(path.dirname(dataFile), { recursive: true });
  const tempFile = `${dataFile}.${process.pid}.${randomUUID()}.tmp`;
  let handle;
  try {
    handle = await open(tempFile, 'wx', 0o600);
    await handle.writeFile(content, 'utf8');
    await handle.sync();
    await handle.close();
    handle = undefined;
    await rename(tempFile, dataFile);
  } finally {
    if (handle) await handle.close().catch(() => {});
    await unlink(tempFile).catch(() => {});
  }
}

async function loadState(dataFile) {
  let content;
  try {
    const info = await stat(dataFile);
    if (info.size > MAX_BYTES) throw new ApiError(500, 'INVALID_DATA_FILE', 'The JSON file is too large. The original file has been preserved; please check it.');
    content = await readFile(dataFile, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const initial = validateState(createInitialState());
    await atomicWrite(dataFile, initial);
    return initial;
  }
  try {
    return validateState(JSON.parse(content));
  } catch (error) {
    throw new ApiError(500, 'INVALID_DATA_FILE', 'The JSON file is corrupt or incompatible. The original has been preserved; repair it and try again.');
  }
}

function json(response, status, body) {
  const content = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(content),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
  });
  response.end(content);
}

async function readJson(request) {
  if (request.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    request.resume();
    throw new ApiError(415, 'CONTENT_TYPE', 'Submit data using application/json.');
  }
  if (Number(request.headers['content-length']) > MAX_BYTES) {
    request.resume();
    throw new ApiError(413, 'BODY_TOO_LARGE', 'Submitted data cannot exceed 8 MiB.');
  }
  const chunks = [];
  let bytes = 0;
  await new Promise((resolve, reject) => {
    request.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes <= MAX_BYTES) chunks.push(chunk);
    });
    request.once('end', resolve);
    request.once('error', reject);
    request.once('aborted', () => reject(new ApiError(400, 'ABORTED', 'The request was interrupted.')));
  });
  if (bytes > MAX_BYTES) throw new ApiError(413, 'BODY_TOO_LARGE', 'Submitted data cannot exceed 8 MiB.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new ApiError(400, 'INVALID_JSON', 'Submitted data is not valid JSON.');
  }
}

function requireLocalHost(request, server) {
  const host = request.headers.host;
  const match = typeof host === 'string' && /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/i.exec(host);
  const address = server.address();
  if (!match || Number(match[2] || 80) !== address?.port) {
    throw new ApiError(403, 'INVALID_HOST', 'Access is only allowed through a local address.');
  }
  if (['PUT', 'POST'].includes(request.method)) {
    const origin = request.headers.origin;
    if ((origin !== undefined && origin.toLowerCase() !== `http://${host.toLowerCase()}`) ||
        request.headers['sec-fetch-site'] === 'cross-site') {
      throw new ApiError(403, 'CROSS_ORIGIN', 'Cross-origin changes to warehouse data are not allowed.');
    }
  }
}

export function createServer({ dataFile = path.join(APP_DIR, 'data', 'inventory.json'), publicDir = path.join(APP_DIR, 'public'), onError = console.error } = {}) {
  const resolvedDataFile = path.resolve(dataFile);
  const resolvedPublicDir = path.resolve(publicDir);
  const server = http.createServer(async (request, response) => {
    try {
      requireLocalHost(request, server);
      const url = new URL(request.url, `http://${request.headers.host}`);
      if (url.pathname === '/api/export/pdf') {
        if (request.method !== 'POST') {
          response.setHeader('Allow', 'POST');
          throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Use POST to export a PDF.');
        }
        const payload = await readJson(request);
        record(payload, ['warehouse', 'itemIds', 'filters'], 'PDF export');
        validateState({ version: 1, revision: 0, updatedAt: new Date().toISOString(), warehouses: [payload.warehouse] });
        const knownIds = new Set(payload.warehouse.items.map((item) => item.id));
        if (!Array.isArray(payload.itemIds) || payload.itemIds.some((id) => !knownIds.has(id)) || new Set(payload.itemIds).size !== payload.itemIds.length) invalid('Select unique materials from this warehouse.');
        record(payload.filters, ['type', 'query', 'shortageOnly'], 'Export filters');
        string(payload.filters.type, 100, 'Type filter');
        string(payload.filters.query, 1000, 'Search filter');
        if (typeof payload.filters.shortageOnly !== 'boolean') invalid('Shortfalls filter must be true or false.');
        let content;
        try { content = await createInventoryPdf(payload.warehouse, payload); }
        catch (error) {
          onError(error);
          throw new ApiError(500, 'EXPORT_ERROR', 'Could not generate the PDF. Please try again.');
        }
        response.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': content.length,
          'Content-Disposition': `attachment; filename="${pdfFilename(payload.warehouse)}"`,
          'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        response.end(content);
        return;
      }
      if (url.pathname === '/api/state') {
        if (request.method === 'GET') {
          const state = await serialized(resolvedDataFile, () => loadState(resolvedDataFile));
          json(response, 200, state);
        } else if (request.method === 'PUT') {
          const incoming = validateState(await readJson(request));
          const saved = await serialized(resolvedDataFile, async () => {
            const current = await loadState(resolvedDataFile);
            if (incoming.revision !== current.revision) {
              throw new ApiError(409, 'REVISION_CONFLICT', 'Another window changed the data. Reload the latest data before editing.', { currentRevision: current.revision });
            }
            if (current.revision === Number.MAX_SAFE_INTEGER) throw new ApiError(409, 'REVISION_LIMIT', 'The revision limit has been reached; saving cannot continue.');
            const next = { ...incoming, revision: current.revision + 1, updatedAt: new Date().toISOString() };
            await atomicWrite(resolvedDataFile, next);
            return next;
          });
          json(response, 200, saved);
        } else {
          response.setHeader('Allow', 'GET, PUT');
          json(response, 405, { error: 'This request method is not supported.', code: 'METHOD_NOT_ALLOWED' });
        }
        return;
      }
      const asset = STATIC_FILES.get(url.pathname);
      if (!asset) throw new ApiError(404, 'NOT_FOUND', 'Page not found.');
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.setHeader('Allow', 'GET, HEAD');
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'This request method is not supported.');
      }
      let content;
      try { content = await readFile(path.join(resolvedPublicDir, asset[0])); }
      catch (error) {
        if (error.code === 'ENOENT') throw new ApiError(404, 'NOT_FOUND', 'Page not found.');
        throw error;
      }
      response.writeHead(200, { 'Content-Type': asset[1], 'Content-Length': content.length, 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY' });
      response.end(request.method === 'HEAD' ? undefined : content);
    } catch (error) {
      if (response.destroyed || response.headersSent) return;
      if (error instanceof ApiError) {
        json(response, error.status, { error: error.message, code: error.code, ...error.details });
      } else {
        onError(error);
        json(response, 500, { error: 'Cannot read or save the JSON file. Check file and directory permissions, then try again.', code: 'STORAGE_ERROR' });
      }
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.setTimeout(30000);
  return server;
}

function parseArguments(args) {
  let port = 4186;
  let dataFile;
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === '--port') {
      const input = args[++i];
      if (!input || !/^\d+$/.test(input) || Number(input) < 1 || Number(input) > 65535) throw new Error('--port must be an integer between 1 and 65535.');
      port = Number(input);
    } else if (args[i] === '--data') {
      dataFile = args[++i];
      if (!dataFile || dataFile.startsWith('--')) throw new Error('--data requires a JSON file path.');
    } else if (args[i] === '--help' || args[i] === '-h') {
      return { help: true };
    } else throw new Error(`Unknown argument: ${args[i]}`);
  }
  return { port, dataFile };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArguments(process.argv.slice(2));
    if (options.help) console.log('Usage: node server.mjs [--port 4186] [--data ./data/inventory.json]');
    else {
      const server = createServer(options);
      server.once('error', (error) => {
        console.error(`Warehouse Studio failed to start: ${error.message}`);
        process.exitCode = 1;
      });
      server.listen(options.port, '127.0.0.1', () => {
        console.log(`Warehouse Studio is running at http://127.0.0.1:${options.port}`);
        console.log(`JSON data: ${path.resolve(options.dataFile || path.join(APP_DIR, 'data', 'inventory.json'))}`);
      });
    }
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
