import type { ArtifactRepository, DatasetRepository } from '../application/ports.js';
import type { ToolDefinition, ToolRequest, RegistryContext, JsonObject } from '../shared/tools.js';
import type { ToolOutput } from '../shared/contracts.js';
const { compute } = require('../tools/exact-client.js') as typeof import('../tools/exact-client.js');
const { mathDefinitions } = require('./math-tools.js') as typeof import('./math-tools.js');
const { DatasetStore } = require('./datasets.js') as typeof import('./datasets.js');
const { ArtifactStore } = require('./artifacts.js') as typeof import('./artifacts.js');
const error = (code: string, message: string) => Object.assign(Error(message), { code });
const Ajv = require('ajv');
const validator = new Ajv({strict:false, strictNumbers:true});
const validators = new WeakMap<object, any>();
function validate(value: any, schema: any, path = 'arguments') {
    let check = validators.get(schema);
    if (!check) { check = validator.compile(schema); validators.set(schema, check); }
    if (!check(value)) {
        const issue = check.errors?.[0];
        throw error('INVALID_ARGUMENT', path + (issue?.instancePath || '') + ': ' + (issue?.message || 'Invalid value.'));
    }
}
function exactDefinition(computeFn: typeof compute): ToolDefinition {
    const descriptor = mathDefinitions(null).find(d => d.name === 'exact_math')!;
    return { ...descriptor,
        async execute(args, context) {
            const {signal, progress} = context;
            if ((args.operation ?? 'evaluate') !== 'evaluate' || Object.keys(args).some(key => !['expression','operation'].includes(key)))
                return descriptor.execute(args, context);
            const output = await computeFn(args.expression, signal, progress);
            if (output.verification?.status !== 'passed')
                throw error('VERIFICATION_FAILED', 'Mathematical verification failed.');
            return { result: output, assumptions: output.model?.assumptions || [], verification: output.verification, diagnostics: { engine: output.candidate?.engine || 'python-exact-affine/2' } };
        }
    };
}
class ToolRegistry {
    definitions: Map<string, ToolDefinition>;
    artifacts: ArtifactRepository;
    calls: Map<string, {
        signature: string;
        promise: Promise<ToolOutput>;
    }>;
    constructor({ computeFn = compute, artifacts = new ArtifactStore(), definitions, datasets = new DatasetStore(), allowedDatasetIds = [], extraDefinitions = [] }: {
        computeFn?: typeof compute;
        artifacts?: ArtifactRepository;
        definitions?: ToolDefinition[];
        datasets?: DatasetRepository;
        allowedDatasetIds?: string[];
        extraDefinitions?: ToolDefinition[];
    } = {}) {
        this.definitions = new Map();
        this.artifacts = artifacts;
        this.calls = new Map();
        for (const definition of definitions || [exactDefinition(computeFn), ...mathDefinitions(datasets, allowedDatasetIds).filter(d => d.name !== 'exact_math'), ...extraDefinitions]) {
            if (this.definitions.has(definition.name))
                throw error('INVALID_SCHEMA', 'Duplicate tool name.');
            this.definitions.set(definition.name, definition);
        }
    }
    catalogue() { return [...this.definitions.values()].map(({ name, description, parameters }) => ({ name, description, parameters })); }
    execute(request: ToolRequest, context: RegistryContext) {
        if (!request || request.schemaVersion !== 1 || ![request.runId, request.callId, request.tool, request.operation].every(x => typeof x === 'string' && x.length > 0 && x.length <= 200))
            throw error('INVALID_ARGUMENT', 'Invalid tool request envelope.');
        for (const field of ['timeoutMs', 'maxOutputBytes'] as const)
            if (request.limits?.[field] !== undefined && (!Number.isInteger(request.limits[field]) || request.limits[field] <= 0))
                throw error('INVALID_ARGUMENT', 'Invalid tool resource limit.');
        const key = request.runId + ':' + request.callId, signature = JSON.stringify(request);
        if (this.calls.has(key)) {
            const old = this.calls.get(key)!;
            if (old.signature !== signature)
                throw error('CALL_CONFLICT', 'Call ID reused with different arguments.');
            return old.promise;
        }
        const promise = this.run(request, context);
        this.calls.set(key, { signature, promise });
        return promise;
    }
    async run(request: ToolRequest, { signal, emit = () => { }, redact = x => x }: RegistryContext): Promise<ToolOutput> {
        signal.throwIfAborted();
        const start = Date.now(), definition = this.definitions.get(request.tool);
        const output: ToolOutput = { schemaVersion: 1, callId: request.callId, tool: request.tool, operation: request.operation, status: 'error', result: null, assumptions: [], diagnostics: {}, verification: { status: 'not_checked', scope: 'Tool result only.' }, artifacts: [], warnings: [], error: null };
        const controller = new AbortController();
        const abort = () => controller.abort();
        signal.addEventListener('abort', abort, { once: true });
        let timer, timedOut = false;
        try {
            if (!definition)
                throw error('UNKNOWN_TOOL', 'Unknown tool. Select a registered mathematics tool.');
            if (definition.operations ? !definition.operations.includes(request.operation) || ((request.arguments as JsonObject)?.operation ?? definition.operation) !== request.operation : request.operation !== definition.operation)
                throw error('INVALID_ARGUMENT', 'Unsupported operation.');
            validate(request.arguments, definition.parameters);
            emit({ type: 'tool.progress', callId: request.callId, stage: 'solving', message: 'Arguments validated; operation: ' + request.operation });
            const timeoutMs = Math.min(definition.timeoutMs || 5000, request.limits?.timeoutMs || 5000);
            timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
            // Every executor must await resource termination on cancellation before settling.
            const value = await definition.execute(request.arguments as JsonObject, { signal: controller.signal, deadline: Date.now()+timeoutMs, callId: request.callId, progress: (stage, message) => { if (!controller.signal.aborted || message.startsWith('MATH_CALL '))
                    emit({ type: 'tool.progress', callId: request.callId, stage, message: redact(message) }); } });
            signal.throwIfAborted();
            if (timedOut)
                throw error('TIMED_OUT', 'Tool exceeded its deadline.');
            Object.assign(output, { result: value.result, assumptions: value.assumptions || [], diagnostics: value.diagnostics || {}, verification: value.verification || output.verification, warnings: value.warnings || [] });
            for (const view of value.views || [])
                output.artifacts.push(this.artifacts.putView(request.runId, view));
            const limit = Math.min(request.limits?.maxOutputBytes || 262144, 262144);
            if (Buffer.byteLength(JSON.stringify(output.result)) > limit) {
                const artifact = this.artifacts.put(request.runId, output.result);
                output.artifacts.push(artifact);
                output.result = { kind: 'artifact', artifactId: artifact.id };
                output.warnings.push('Full result stored as a local artifact.');
            }
            output.status = value.error ? 'error' : 'ok';
            if (value.error)
                output.error = value.error;
        }
        catch (cause) {
            if (signal.aborted) {
                output.status = 'cancelled';
                output.error = { code: 'CANCELLED', message: 'Tool cancelled.' };
            }
            else
                output.error = { code: timedOut ? 'TIMED_OUT' : cause.code || 'TOOL_ERROR', message: timedOut ? 'Tool exceeded its deadline.' : redact(cause.message) };
        }
        finally {
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            output.diagnostics.elapsedMs = Date.now() - start;
        }
        return output;
    }
}
export { ToolRegistry, validate, exactDefinition };
