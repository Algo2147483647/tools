import type { Run, Patch, Block } from './contracts';
const terminal = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
export interface ContentEvent {
    [key: string]: unknown;
    type: string;
    timestamp?: string;
    messageId?: string;
    callId?: string;
    name?: string;
    operation?: string;
    input?: unknown;
    limits?: {
        timeoutMs: number;
    };
    text?: string;
    usage?: Record<string, number>;
    message?: string;
    stage?: string;
    output?: Block['output'];
}
export function applyContent(run: Run, event: ContentEvent) { run.blocks ??= []; const timestamp = event.timestamp || new Date().toISOString(); if (event.type === 'message.started')
    run.blocks.push({ id: event.messageId!, kind: 'text', text: '', status: 'streaming', startedAt: timestamp });
else if (event.type === 'tool.started')
    run.blocks.push({ id: event.callId!, kind: 'tool', name: event.name, input: event.input, operation: event.operation, limits: event.limits, progressEvents: [], status: 'running', startedAt: timestamp });
else {
    const block = run.blocks.find(b => b.id === (event.messageId || event.callId));
    if (!block)
        return;
    if (event.type === 'text.delta')
        block.text = (block.text || '') + (event.text || '');
    else if (event.type === 'reasoning.delta')
        block.reasoning = (block.reasoning || '') + (event.text || '');
    else if (event.type === 'message.completed') {
        block.status = 'completed';
        block.finishedAt = timestamp;
        block.usage = event.usage;
    }
    else if (event.type === 'transport.activity')
        block.transport = { stage: event.stage || 'connected', updatedAt: timestamp };
    else if (event.type === 'transport.compatibility')
        block.compatibility = event.message;
    else if (event.type === 'tool.progress') {
        block.progressEvents ??= [];
        block.progressEvents.push({ stage: event.stage || '', message: event.message || '', timestamp });
    }
    else if ((event.type === 'tool.completed' || event.type === 'tool.failed') && event.output) {
        block.finishedAt = timestamp;
        block.output = event.output;
        block.status = event.output.status === 'ok' ? 'completed' : event.output.status === 'cancelled' ? 'cancelled' : 'failed';
    }
} }
export class WorkspaceState {
    runs = new Map<string, Run>();
    selectedId: string | null = null;
    activeId: string | null = null;
    receive(run: Run) { const old = this.runs.get(run.id); if (old && ((old.revision || 0) > (run.revision || 0) || old.events.length > run.events.length || (terminal.has(old.status) && !terminal.has(run.status))))
        return false; this.runs.set(run.id, run); if (!terminal.has(run.status))
        this.activeId = run.id;
    else if (this.activeId === run.id)
        this.activeId = null; return true; }
    delta(patch: Patch): 'gap' | 'applied' | 'stale' { const run = this.runs.get(patch.runId); if (!run)
        return 'gap'; if (patch.revision <= (run.revision || 0) || terminal.has(run.status))
        return 'stale'; if (patch.revision !== (run.revision || 0) + 1)
        return 'gap'; applyContent(run, patch.event as unknown as ContentEvent); run.revision = patch.revision; return 'applied'; }
    get selected() { return this.selectedId ? this.runs.get(this.selectedId) : undefined; }
    get busy() { return Boolean(this.activeId); }
    isStale(input: string) { return Boolean(this.selected && this.selected.input !== input.trim()); }
}
