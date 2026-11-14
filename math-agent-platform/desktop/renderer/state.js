(function (root) {
  const terminal = new Set(['completed', 'failed', 'cancelled', 'timed_out']);
  function applyContent(run, event) {
    run.blocks ||= [];
    if (event.type === 'message.started') run.blocks.push({ id: event.messageId, kind: 'text', text: '', status: 'streaming', startedAt: event.timestamp });
    else if (event.type === 'tool.started') run.blocks.push({ id: event.callId, kind: 'tool', name: event.name, input: event.input, operation: event.operation, limits: event.limits, progressEvents: [], status: 'running', startedAt: event.timestamp, progress: '' });
    else {
      const block = run.blocks.find(b => b.id === (event.messageId || event.callId)); if (!block) return;
      if (event.type === 'text.delta') block.text += event.text;
      else if (event.type === 'message.completed') { block.status = 'completed'; block.finishedAt = event.timestamp; block.usage = event.usage; }
      else if (event.type === 'transport.compatibility') block.compatibility = event.message;
      else if (event.type === 'tool.progress') { block.progress = event.message; block.progressEvents ||= []; block.progressEvents.push({ stage: event.stage, message: event.message, timestamp: event.timestamp }); }
      else if (event.type === 'tool.completed' || event.type === 'tool.failed') { block.finishedAt = event.timestamp; block.output = event.output; block.status = event.output.status === 'ok' ? 'completed' : event.output.status === 'cancelled' ? 'cancelled' : 'failed'; }
    }
  }
  class WorkspaceState {
    constructor() { this.runs = new Map(); this.selectedId = null; this.activeId = null; }
    receive(run) {
      const old = this.runs.get(run.id);
      if (old && ((old.revision || 0) > (run.revision || 0) || old.events.length > run.events.length || (terminal.has(old.status) && !terminal.has(run.status)))) return false;
      this.runs.set(run.id, run);
      if (!terminal.has(run.status)) this.activeId = run.id;
      else if (this.activeId === run.id) this.activeId = null;
      return true;
    }
    delta(patch) {
      const run = this.runs.get(patch.runId);
      if (!run) return 'gap';
      if (patch.revision <= (run.revision || 0) || terminal.has(run.status)) return 'stale';
      if (patch.revision !== (run.revision || 0) + 1) return 'gap';
      applyContent(run, patch.event); run.revision = patch.revision; return 'applied';
    }
    get selected() { return this.runs.get(this.selectedId); }
    get busy() { return Boolean(this.activeId); }
    isStale(input) { return Boolean(this.selected && this.selected.input !== input.trim()); }
  }
  if (typeof module !== 'undefined') module.exports = { WorkspaceState, applyContent };
  else { root.WorkspaceState = WorkspaceState; root.applyContent = applyContent; }
})(typeof window === 'undefined' ? globalThis : window);
