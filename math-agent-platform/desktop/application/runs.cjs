const { randomUUID } = require('node:crypto');
const { hash } = require('../core/engine.cjs');
const { compute } = require('../core/worker-client.cjs');
const { applyContent } = require('../renderer/state.js');
const { DatasetStore } = require('../tools/datasets.cjs');
const { ArtifactStore } = require('../tools/artifacts.cjs');
const providers = require('../ai/providers.cjs');

const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const ALLOWED = {
  queued: ['understanding', 'cancelling', 'failed'],
  understanding: ['explaining', 'cancelling', 'failed', 'timed_out'],
  explaining: ['solving', 'completed', 'cancelling', 'failed', 'timed_out'],
  solving: ['verifying', 'explaining', 'cancelling', 'failed', 'timed_out'],
  verifying: ['explaining', 'cancelling', 'failed', 'timed_out'],
  cancelling: ['cancelled', 'failed']
};
const { runAgent } = require('../ai/agent.cjs');
const clone = value => JSON.parse(JSON.stringify(value));
class RunService {
  constructor({ request = fetch, notify = () => {}, notifyDelta = () => {}, computeFn = compute, aiTimeoutMs = 120000 } = {}) {
    this.request = request; this.notify = notify; this.notifyDelta = notifyDelta; this.artifacts = new ArtifactStore(); this.datasets = new DatasetStore(); this.compute = computeFn;
    this.aiTimeoutMs = aiTimeoutMs; this.runs = new Map(); this.settings = null; this.active = null;
  }
  configure(raw) {
    if (this.active) throw Error('Stop the active operation before applying settings.');
    this.settings = providers.validateSettings(this.resolveSettings(raw));
    return this.publicSettings();
  }
  publicSettings() {
    if (!this.settings) return null;
    const { apiKey, ...safe } = this.settings;
    return { ...safe, hasKey: Boolean(apiKey) };
  }
  resolveSettings(raw) {
    if (!raw?.keepApiKey) return raw;
    const normalized = providers.validateSettings(raw, false);
    if (!this.settings || normalized.provider !== this.settings.provider || normalized.baseUrl !== this.settings.baseUrl) throw Error('A saved key cannot be reused for a different endpoint.');
    return { ...raw, apiKey: this.settings.apiKey };
  }
  list() { return [...this.runs.values()].reverse().map(clone); }
  get(id) { const run = this.runs.get(id); if (!run) throw Error('Run not found.'); return clone(run); }
  publish(run) { this.notify(this.get(run.id)); }
  content(run, event) {
    if (TERMINAL.has(run.status)) return;
    if (event.type === 'text.delta') {
      run.textBytes += Buffer.byteLength(event.text);
      if (run.textBytes > 1024 * 1024) throw Object.assign(Error('Answer exceeds 1 MB.'), { code: 'OUTPUT_LIMIT' });
    }
    if (++run.contentEvents > 100000) throw Object.assign(Error('Event limit reached.'), { code: 'OUTPUT_LIMIT' });
    event = { ...event, timestamp: new Date().toISOString() };
    applyContent(run, event); run.revision++;
    this.notifyDelta({ runId: run.id, revision: run.revision, event });
  }
  event(run, stage, message) {
    if (run.status !== stage) {
      if (!ALLOWED[run.status]?.includes(stage)) throw Error(`Invalid run transition: ${run.status} -> ${stage}`);
      run.status = stage;
    }
    run.events.push({ runId: run.id, sequence: run.events.length + 1, stage, message, timestamp: new Date().toISOString() });
    if (TERMINAL.has(stage)) { run.finishedAt = new Date().toISOString(); for (const block of run.blocks) if (['running', 'streaming'].includes(block.status)) block.status = stage === 'completed' ? 'completed' : stage; }
    run.revision++;
    this.publish(run);
  }
  start(raw) {
    if (this.active) throw Error('An operation is already running.');
    if (!raw || typeof raw.input !== 'string' || !raw.input.trim()) throw Error('Enter a question first.');
    if (Buffer.byteLength(raw.input) > 256 * 1024) throw Error('Input exceeds 256 KB.');
    if (!this.settings) throw Object.assign(Error('Configure an AI service first.'), { code: 'CONFIG_REQUIRED' });
    if (this.runs.size >= 50) throw Error('Session history is full (50 runs). Clear history before continuing.');
    const datasetIds = raw.datasetIds || [];
    if (!Array.isArray(datasetIds) || datasetIds.length > 4 || datasetIds.some(id => typeof id !== 'string')) throw Error('Attach at most four datasets.');
    const attachedDatasets = this.datasets.describe(datasetIds);
    let parent = null;
    if (raw.parentId) {
      parent = this.runs.get(raw.parentId);
      if (!parent) throw Error('Source run not found.');
    }
    const run = {
      schemaVersion: 1, id: randomUUID(), parentId: parent?.id || null,
      datasetIds: [...datasetIds], datasets: attachedDatasets, input: raw.input.trim(), inputHash: hash(raw.input.trim()),
      settings: this.publicSettings(), status: 'queued', createdAt: new Date().toISOString(),
      finishedAt: null, events: [], blocks: [], revision: 0, textBytes: 0, contentEvents: 0, result: null, error: null
    };
    this.runs.set(run.id, run);
    const control = { id: run.id, controller: new AbortController(), settings: this.settings && { ...this.settings } };
    this.active = control; this.publish(run);
    // Publish the run identity before any asynchronous event can complete.
    control.done = Promise.resolve().then(() => this.execute(run, control));
    return this.get(run.id);
  }
  async execute(run, control) {
    const signal = control.controller.signal;
    try {
      if (signal.aborted) throw Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' });
      this.event(run, 'understanding', 'Input snapshot captured');
      this.event(run, 'explaining', 'AI request');
      const timeout = new AbortController();
      const abort = () => timeout.abort();
      signal.addEventListener('abort', abort, { once: true });
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; timeout.abort(); }, this.aiTimeoutMs);
      try {
        run.result = await runAgent({ settings: control.settings, input: run.input,
          signal: timeout.signal, request: this.request, compute: this.compute, runId: run.id, artifacts: this.artifacts, datasets: this.datasets, datasetIds: run.datasetIds,
          onContent: event => this.content(run, event),
          emit: (stage, message) => { this.guard(signal); this.event(run, stage, message); } });
        this.guard(signal);
        if (timedOut) throw Object.assign(Error('Run exceeded the time limit.'), { code: 'TIMED_OUT' });
        this.event(run, 'completed', 'Answer received');
      } catch (error) {
        if (timedOut && !signal.aborted) throw Object.assign(Error('Run exceeded the time limit.'), { code: 'TIMED_OUT' });
        throw error;
      } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); }
    } catch (error) {
      run.error = { code: signal.aborted ? 'CANCELLED' : error.code || 'REQUEST_FAILED', message: signal.aborted ? 'Run cancelled.' : this.redact(error.message, control.settings) };
      this.event(run, signal.aborted ? 'cancelled' : error.code === 'TIMED_OUT' ? 'timed_out' : 'failed', run.error.message);
    } finally { if (this.active === control) this.active = null; this.publish(run); }
  }
  guard(signal) { if (signal.aborted) throw Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' }); }
  redact(message, settings) { return settings?.apiKey ? String(message).split(settings.apiKey).join('[redacted]') : String(message); }
  async cancel(id) {
    const active = this.active;
    if (!active || active.id !== id) return;
    const run = this.runs.get(id);
    if (run && !TERMINAL.has(run.status)) this.event(run, 'cancelling', 'Cancellation requested; waiting for the operation to stop');
    active.controller.abort(); await active.done;
  }
  async settingOperation(kind, raw) {
    if (this.active) throw Error('An operation is already running.');
    if (!['models', 'test'].includes(kind)) throw Error('Unknown settings operation.');
    const settings = providers.validateSettings(this.resolveSettings(raw), kind !== 'models');
    const control = { id: 'settings', controller: new AbortController(), settings };
    this.active = control;
    const timer = setTimeout(() => control.controller.abort(), this.aiTimeoutMs);
    control.done = (async () => {
      try {
        return kind === 'models' ? await providers.models(settings, control.controller.signal, this.request) : await providers.solve(settings, 'Reply only with OK.', control.controller.signal, this.request);
      } catch (error) { throw Error(control.controller.signal.aborted ? 'Settings request cancelled or timed out.' : this.redact(error.message, settings)); }
      finally { clearTimeout(timer); if (this.active === control) this.active = null; }
    })();
    return control.done;
  }
  clear() { if (this.active) throw Error('Stop the active operation before clearing history.'); this.runs.clear(); this.artifacts.clear(); this.datasets.clear(); }
  dispose() { if (this.active) { const id = this.active.id; this.cancel(id).catch(() => {}); } }
}
module.exports = { RunService, ALLOWED };
