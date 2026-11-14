import type { Run, RunRecord, Patch, Settings } from '../shared/contracts.js';
import type { ContentEvent } from '../shared/run-state.js';
import type { ToolSession } from './ports.js';
export interface RunServiceOptions {
    session: ToolSession;
    request?: typeof fetch;
    notify?: (run: Run) => void;
    notifyDelta?: (patch: Patch) => void;
    computeFn?: typeof compute;
    aiTimeoutMs?: number;
}
interface Control {
    id: string;
    controller: AbortController;
    settings: ReturnType<typeof providers.validateSettings>;
    done?: Promise<unknown>;
}
const { randomUUID } = require('node:crypto') as typeof import('node:crypto');
const { hash } = require('../core/engine.js') as typeof import('../core/engine.js');
const { compute } = require('../core/worker-client.js') as typeof import('../core/worker-client.js');
const { applyContent } = require('../shared/run-state.js') as typeof import('../shared/run-state.js');
const providers = require('../ai/providers.js') as typeof import('../ai/providers.js');
const TERMINAL = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
const ALLOWED: Record<string, string[]> = {
    queued: ['understanding', 'cancelling', 'failed'],
    understanding: ['explaining', 'cancelling', 'failed', 'timed_out'],
    explaining: ['solving', 'completed', 'cancelling', 'failed', 'timed_out'],
    solving: ['verifying', 'explaining', 'cancelling', 'failed', 'timed_out'],
    verifying: ['explaining', 'cancelling', 'failed', 'timed_out'],
    cancelling: ['cancelled', 'failed']
};
const { runAgent } = require('../ai/agent.js') as typeof import('../ai/agent.js');
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
class RunService {
    request: typeof fetch;
    notify: (run: Run) => void;
    notifyDelta: (patch: Patch) => void;
    artifacts: ToolSession['artifacts'];
    datasets: ToolSession['datasets'];
    document: ToolSession['document'];
    session: ToolSession;
    compute: typeof compute;
    extraDefinitions: ToolSession['definitions'];
    aiTimeoutMs: number;
    runs = new Map<string, RunRecord>();
    settings: ReturnType<typeof providers.validateSettings> | null = null;
    active: Control | null = null;
    settingsError = '';
    constructor({ session, request = fetch, notify = () => { }, notifyDelta = () => { }, computeFn = compute, aiTimeoutMs = 120000 }: RunServiceOptions) { this.session = session; this.request = request; this.notify = notify; this.notifyDelta = notifyDelta; this.artifacts = session.artifacts; this.datasets = session.datasets; this.document = session.document; this.extraDefinitions = session.definitions; this.compute = computeFn; this.aiTimeoutMs = aiTimeoutMs; }
    configure(raw: any) {
        if (this.active)
            throw Error('Stop the active operation before applying settings.');
        this.settings = providers.validateSettings(this.resolveSettings(raw));
        return this.publicSettings();
    }
    publicSettings() {
        if (!this.settings)
            return null;
        const { apiKey, ...safe } = this.settings;
        return { ...safe, hasKey: Boolean(apiKey) };
    }
    resolveSettings(raw: any) {
        if (!raw?.keepApiKey)
            return raw;
        const normalized = providers.validateSettings(raw, false);
        if (!this.settings || normalized.provider !== this.settings.provider || normalized.baseUrl !== this.settings.baseUrl)
            throw Error('A saved key cannot be reused for a different endpoint.');
        return { ...raw, apiKey: this.settings.apiKey };
    }
    list() { return [...this.runs.values()].reverse().map(clone); }
    get(id: string) { const run = this.runs.get(id); if (!run)
        throw Error('Run not found.'); return clone(run); }
    publish(run: RunRecord) { this.notify(this.get(run.id)); }
    content(run: RunRecord, event: ContentEvent) {
        if (TERMINAL.has(run.status))
            return;
        if (event.type === 'text.delta') {
            run.textBytes += Buffer.byteLength(event.text || '');
            if (run.textBytes > 1024 * 1024)
                throw Object.assign(Error('Answer exceeds 1 MB.'), { code: 'OUTPUT_LIMIT' });
        }
        if (++run.contentEvents > 100000)
            throw Object.assign(Error('Event limit reached.'), { code: 'OUTPUT_LIMIT' });
        event = { ...event, timestamp: new Date().toISOString() };
        applyContent(run, event);
        run.revision++;
        this.notifyDelta({ runId: run.id, revision: run.revision, event });
    }
    event(run: RunRecord, stage: string, message: string) {
        if (run.status !== stage) {
            if (!ALLOWED[run.status]?.includes(stage))
                throw Error(`Invalid run transition: ${run.status} -> ${stage}`);
            run.status = stage;
        }
        run.events.push({ runId: run.id, sequence: run.events.length + 1, stage, message, timestamp: new Date().toISOString() });
        if (TERMINAL.has(stage)) {
            run.finishedAt = new Date().toISOString();
            for (const block of run.blocks)
                if (['running', 'streaming'].includes(block.status))
                    block.status = stage === 'completed' ? 'completed' : stage;
        }
        run.revision++;
        this.publish(run);
    }
    start(raw: any) {
        if (this.active)
            throw Error('An operation is already running.');
        if (!raw || typeof raw.input !== 'string' || !raw.input.trim())
            throw Error('Enter a question first.');
        if (Buffer.byteLength(raw.input) > 256 * 1024)
            throw Error('Input exceeds 256 KB.');
        if (!this.settings)
            throw Object.assign(Error('Configure an AI service first.'), { code: 'CONFIG_REQUIRED' });
        if (this.runs.size >= 50)
            throw Error('Session history is full (50 runs). Clear history before continuing.');
        const datasetIds = raw.datasetIds || [];
        if (!Array.isArray(datasetIds) || datasetIds.length > 4 || datasetIds.some(id => typeof id !== 'string'))
            throw Error('Attach at most four datasets.');
        const attachedDatasets = this.datasets.describe(datasetIds);
        let parent = null;
        if (raw.parentId) {
            parent = this.runs.get(raw.parentId);
            if (!parent)
                throw Error('Source run not found.');
        }
        const run: RunRecord = {
            schemaVersion: 1, id: randomUUID(), parentId: parent?.id || null,
            datasetIds: [...datasetIds], datasets: attachedDatasets, input: raw.input.trim(), inputHash: hash(raw.input.trim()),
            settings: this.publicSettings()!, status: 'queued', createdAt: new Date().toISOString(),
            finishedAt: null, events: [], blocks: [], revision: 0, textBytes: 0, contentEvents: 0, result: null, error: null
        };
        if (raw.document !== undefined)
            this.document.update(raw.document);
        this.runs.set(run.id, run);
        const control: Control = { id: run.id, controller: new AbortController(), settings: { ...this.settings! } };
        this.active = control;
        this.publish(run);
        // Publish the run identity before any asynchronous event can complete.
        control.done = Promise.resolve().then(() => this.execute(run, control));
        return this.get(run.id);
    }
    async execute(run: RunRecord, control: Control) {
        const signal = control.controller.signal;
        try {
            if (signal.aborted)
                throw Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' });
            this.event(run, 'understanding', 'Input snapshot captured');
            this.event(run, 'explaining', 'AI request');
            const timeout = new AbortController();
            const abort = () => timeout.abort();
            signal.addEventListener('abort', abort, { once: true });
            let timedOut = false;
            const timer = setTimeout(() => { timedOut = true; timeout.abort(); }, this.aiTimeoutMs);
            try {
                run.result = await runAgent({ settings: control.settings, input: run.input,
                    signal: timeout.signal, request: this.request, compute: this.compute, runId: run.id, artifacts: this.artifacts, datasets: this.datasets, datasetIds: run.datasetIds, extraDefinitions: this.extraDefinitions,
                    onContent: event => this.content(run, event),
                    emit: (stage, message) => { this.guard(signal); this.event(run, stage, message); } });
                this.guard(signal);
                if (timedOut)
                    throw Object.assign(Error('Run exceeded the time limit.'), { code: 'TIMED_OUT' });
                this.event(run, 'completed', 'Answer received');
            }
            catch (error) {
                if (timedOut && !signal.aborted)
                    throw Object.assign(Error('Run exceeded the time limit.'), { code: 'TIMED_OUT' });
                throw error;
            }
            finally {
                clearTimeout(timer);
                signal.removeEventListener('abort', abort);
            }
        }
        catch (error) {
            run.error = { code: signal.aborted ? 'CANCELLED' : error.code || 'REQUEST_FAILED', message: signal.aborted ? 'Run cancelled.' : this.redact(error.message, control.settings) };
            this.event(run, signal.aborted ? 'cancelled' : error.code === 'TIMED_OUT' ? 'timed_out' : 'failed', run.error.message);
        }
        finally {
            if (this.active === control)
                this.active = null;
            this.publish(run);
        }
    }
    guard(signal: AbortSignal) { if (signal.aborted)
        throw Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' }); }
    redact(message: string, settings: any) { return settings?.apiKey ? String(message).split(settings.apiKey).join('[redacted]') : String(message); }
    async cancel(id: string) {
        const active = this.active;
        if (!active || active.id !== id)
            return;
        const run = this.runs.get(id);
        if (run && !TERMINAL.has(run.status))
            this.event(run, 'cancelling', 'Cancellation requested; waiting for the operation to stop');
        active.controller.abort();
        await active.done;
    }
    async settingOperation(kind: string, raw: any) {
        if (this.active)
            throw Error('An operation is already running.');
        if (!['models', 'test'].includes(kind))
            throw Error('Unknown settings operation.');
        const settings = providers.validateSettings(this.resolveSettings(raw), kind !== 'models');
        const control: Control = { id: 'settings', controller: new AbortController(), settings };
        this.active = control;
        const timer = setTimeout(() => control.controller.abort(), this.aiTimeoutMs);
        control.done = (async () => {
            try {
                return kind === 'models' ? await providers.models(settings, control.controller.signal, this.request) : await providers.solve(settings, 'Reply only with OK.', control.controller.signal, this.request);
            }
            catch (error) {
                throw Error(control.controller.signal.aborted ? 'Settings request cancelled or timed out.' : this.redact(error.message, settings));
            }
            finally {
                clearTimeout(timer);
                if (this.active === control)
                    this.active = null;
            }
        })();
        return control.done;
    }
    clear() { if (this.active)
        throw Error('Stop the active operation before clearing history.'); this.runs.clear(); this.artifacts.clear(); this.datasets.clear(); this.session.clear().catch(() => { }); }
    dispose() { if (this.active) {
        const id = this.active.id;
        this.cancel(id).finally(() => this.session.clear()).catch(() => { });
    }
    else {
        this.session.clear().catch(() => { });
    } }
}
export { RunService, ALLOWED };
