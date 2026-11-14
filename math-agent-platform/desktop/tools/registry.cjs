const { compute } = require('../core/worker-client.cjs');
const { mathDefinitions } = require('./math-tools.cjs');
const { DatasetStore } = require('./datasets.cjs');
const { ArtifactStore } = require('./artifacts.cjs');
const error = (code, message) => Object.assign(Error(message), { code });
function validate(value, schema, path = 'arguments') {
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw error('INVALID_ARGUMENT', path + ' must be an object.');
    for (const key of schema.required || []) if (!Object.hasOwn(value, key)) throw error('INVALID_ARGUMENT', path + '.' + key + ' is required.');
    for (const key of Object.keys(value)) {
      if (!Object.hasOwn(schema.properties || {}, key)) { if (schema.additionalProperties === false) throw error('INVALID_ARGUMENT', 'Unexpected argument: ' + key); }
      else validate(value[key], schema.properties[key], path + '.' + key);
    }
  } else if (schema.type === 'string') {
    if (typeof value !== 'string' || !value.trim() || value.length > (schema.maxLength || 65536)) throw error('INVALID_ARGUMENT', path + ' must be a nonempty bounded string.');
  } else if (schema.type === 'number' || schema.type === 'integer') {
    if (!Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value)) || value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) throw error('INVALID_ARGUMENT', 'Invalid number: ' + path);
  } else if (schema.type === 'boolean') { if (typeof value !== 'boolean') throw error('INVALID_ARGUMENT', 'Invalid boolean: ' + path); }
  else if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 1000) || value.length < (schema.minItems ?? 0)) throw error('INVALID_ARGUMENT', 'Invalid array: ' + path);
    value.forEach((item, i) => validate(item, schema.items, path + '[' + i + ']'));
  } else throw error('INVALID_SCHEMA', 'Unsupported tool schema.');
  if (schema.enum && !schema.enum.includes(value)) throw error('INVALID_ARGUMENT', 'Unsupported value: ' + path);
}
function exactDefinition(computeFn) {
  return {
    name: 'exact_math', version: '1.0.0', operation: 'evaluate', timeoutMs: 5000,
    description: 'Exact rational arithmetic or a single-variable linear equation. ASCII + - * / parentheses and implicit multiplication. No powers, functions, variable denominators or systems. Returns exact result, assumptions and verification.',
    parameters: { type: 'object', properties: { expression: { type: 'string', maxLength: 4096 } }, required: ['expression'], additionalProperties: false },
    async execute(args, { signal, progress }) {
      const output = await computeFn(args.expression, signal, progress);
      if (output.verification?.status !== 'passed') throw error('VERIFICATION_FAILED', 'Mathematical verification failed.');
      return { result: output, assumptions: output.model?.assumptions || [], verification: output.verification, diagnostics: { engine: output.candidate?.engine || 'exact-linear/1' } };
    }
  };
}
class ToolRegistry {
  constructor({ computeFn = compute, artifacts = new ArtifactStore(), definitions, datasets = new DatasetStore(), allowedDatasetIds = [] } = {}) {
    this.definitions = new Map(); this.artifacts = artifacts; this.calls = new Map();
    for (const definition of definitions || [exactDefinition(computeFn), ...mathDefinitions(datasets, allowedDatasetIds)]) {
      if (this.definitions.has(definition.name)) throw error('INVALID_SCHEMA', 'Duplicate tool name.');
      this.definitions.set(definition.name, definition);
    }
  }
  catalogue() { return [...this.definitions.values()].map(({ name, description, parameters }) => ({ name, description, parameters })); }
  execute(request, context) {
    if (!request || request.schemaVersion !== 1 || ![request.runId, request.callId, request.tool, request.operation].every(x => typeof x === 'string' && x.length > 0 && x.length <= 200)) throw error('INVALID_ARGUMENT', 'Invalid tool request envelope.');
    for (const field of ['timeoutMs', 'maxOutputBytes']) if (request.limits?.[field] !== undefined && (!Number.isInteger(request.limits[field]) || request.limits[field] <= 0)) throw error('INVALID_ARGUMENT', 'Invalid tool resource limit.');
    const key = request.runId + ':' + request.callId, signature = JSON.stringify(request);
    if (this.calls.has(key)) { const old = this.calls.get(key); if (old.signature !== signature) throw error('CALL_CONFLICT', 'Call ID reused with different arguments.'); return old.promise; }
    const promise = this.run(request, context); this.calls.set(key, { signature, promise }); return promise;
  }
  async run(request, { signal, emit = () => {}, redact = x => x }) {
    signal.throwIfAborted();
    const start = Date.now(), definition = this.definitions.get(request.tool);
    const output = { schemaVersion: 1, callId: request.callId, tool: request.tool, operation: request.operation, status: 'error', result: null, assumptions: [], diagnostics: {}, verification: { status: 'not_checked', scope: 'Tool result only.' }, artifacts: [], warnings: [], error: null };
    const controller = new AbortController(); const abort = () => controller.abort(); signal.addEventListener('abort', abort, { once: true });
    let timer, timedOut = false;
    try {
      if (!definition) throw error('UNKNOWN_TOOL', 'Unknown tool. Select a registered mathematics tool.');
      if (definition.operations ? !definition.operations.includes(request.operation) || request.arguments?.operation !== request.operation : request.operation !== definition.operation) throw error('INVALID_ARGUMENT', 'Unsupported operation.');
      validate(request.arguments, definition.parameters);
      emit({ type: 'tool.progress', callId: request.callId, stage: 'solving', message: 'Arguments validated; operation: ' + request.operation });
      const timeoutMs = Math.min(definition.timeoutMs || 5000, request.limits?.timeoutMs || 5000);
      timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      // Every executor must await resource termination on cancellation before settling.
      const value = await definition.execute(request.arguments, { signal: controller.signal, progress: (stage, message) => { if (!controller.signal.aborted) emit({ type: 'tool.progress', callId: request.callId, stage, message: redact(message) }); } });
      signal.throwIfAborted(); if (timedOut) throw error('TIMED_OUT', 'Tool exceeded its deadline.');
      Object.assign(output, { result: value.result, assumptions: value.assumptions || [], diagnostics: value.diagnostics || {}, verification: value.verification || output.verification, warnings: value.warnings || [] });
      for (const view of value.views || []) output.artifacts.push(this.artifacts.putView(request.runId, view));
      const limit = Math.min(request.limits?.maxOutputBytes || 262144, 262144);
      if (Buffer.byteLength(JSON.stringify(output.result)) > limit) {
        const artifact = this.artifacts.put(request.runId, output.result); output.artifacts.push(artifact); output.result = { kind: 'artifact', artifactId: artifact.id }; output.warnings.push('Full result stored as a local artifact.');
      }
      output.status = 'ok';
    } catch (cause) {
      if (signal.aborted) { output.status = 'cancelled'; output.error = { code: 'CANCELLED', message: 'Tool cancelled.' }; }
      else output.error = { code: timedOut ? 'TIMED_OUT' : cause.code || 'TOOL_ERROR', message: timedOut ? 'Tool exceeded its deadline.' : redact(cause.message) };
    } finally { clearTimeout(timer); signal.removeEventListener('abort', abort); output.diagnostics.elapsedMs = Date.now() - start; }
    return output;
  }
}
module.exports = { ToolRegistry, validate, exactDefinition };
