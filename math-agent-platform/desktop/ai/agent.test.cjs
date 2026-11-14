const test = require('node:test');
const assert = require('node:assert/strict');
const { runAgent } = require('./agent.cjs');
const { compute } = require('../core/worker-client.cjs');
const { RunService } = require('../application/runs.cjs');
const settings = provider => ({ provider, baseUrl: 'https://example.com', model: 'test', apiKey: '', maxTokens: 1024 });
const response = value => new Response(JSON.stringify(value));
function toolReply(provider, expression = 'x + 6 = 1', name = 'exact_math') {
  if (provider === 'anthropic') return { content: [{ type: 'tool_use', id: 'call1', name, input: { expression } }], stop_reason: 'tool_use' };
  if (provider === 'gemini') return { candidates: [{ content: { role: 'model', parts: [{ functionCall: { name, args: { expression } }, thoughtSignature: 'preserve-me' }] }, finishReason: 'STOP' }] };
  const message = { role: 'assistant', content: '', tool_calls: [{ id: 'call1', type: 'function', function: { name, arguments: provider === 'ollama' ? { expression } : JSON.stringify({ expression }) } }] };
  return provider === 'ollama' ? { message } : { choices: [{ message, finish_reason: 'tool_calls' }] };
}
function finalReply(provider) {
  if (provider === 'anthropic') return { content: [{ type: 'text', text: 'x = -5' }], stop_reason: 'end_turn' };
  if (provider === 'gemini') return { candidates: [{ content: { role: 'model', parts: [{ text: 'x = -5' }] }, finishReason: 'STOP' }] };
  const message = { role: 'assistant', content: 'x = -5' };
  return provider === 'ollama' ? { message } : { choices: [{ message, finish_reason: 'stop' }] };
}
for (const provider of ['openai-compatible', 'deepseek', 'anthropic', 'gemini', 'ollama']) test(provider + ': AI invokes real worker and receives evidence', async () => {
  let requests = 0;
  const result = await runAgent({ settings: settings(provider), input: 'Solve x + 6 = 1', signal: new AbortController().signal, compute, request: async (_url, init) => {
    const body = JSON.parse(init.body); assert.ok(body.tools.length);
    if (requests++) { const history = JSON.stringify(body.messages || body.contents); assert.match(history, /passed/); assert.match(history, /-5/); if (provider === 'gemini') assert.match(history, /preserve-me/); return response(finalReply(provider)); }
    return response(toolReply(provider));
  } });
  assert.equal(requests, 2); assert.equal(result.tools[0].output.result.candidate.value, '-5'); assert.equal(result.verification.status, 'unverified');
});
test('unknown tool is returned as an error and never executed', async () => {
  let requests = 0;
  const result = await runAgent({ settings: settings('ollama'), input: 'q', signal: new AbortController().signal, compute: () => assert.fail('must not execute'), request: async () => response(requests++ ? finalReply('ollama') : toolReply('ollama', '1', 'shell')) });
  assert.match(result.tools[0].output.error.message, /Unknown tool/);
});
test('bounded tool loop', async () => {
  let executions = 0;
  await assert.rejects(runAgent({ settings: settings('ollama'), input: 'q', signal: new AbortController().signal, compute: async () => { executions++; return { verification: { status: 'passed' } }; }, request: async () => response(toolReply('ollama')) }), { code: 'TOOL_LIMIT' });
  assert.equal(executions, 8);
});
test('AI can answer without tools', async () => {
  const result = await runAgent({ settings: settings('ollama'), input: 'q', signal: new AbortController().signal, compute: () => assert.fail(), request: async () => response(finalReply('ollama')) });
  assert.equal(result.tools.length, 0);
});
test('configuration required; legacy local mode cannot bypass AI', async () => {
  const service = new RunService({ computeFn: () => assert.fail(), request: async () => response(finalReply('ollama')) });
  assert.throws(() => service.start({ input: '1', mode: 'local' }), { code: 'CONFIG_REQUIRED' });
  service.configure(settings('ollama')); const run = service.start({ input: '1', mode: 'local' }); await service.active.done;
  assert.equal('mode' in service.get(run.id), false); assert.equal(service.get(run.id).status, 'completed');
});
for (const cancel of [true, false]) test(cancel ? 'cancel waits and releases active run' : 'whole run timeout releases active run', async () => {
  const service = new RunService({ aiTimeoutMs: cancel ? 1000 : 20, request: async (_u, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(Error('aborted')), { once: true })) });
  service.configure(settings('ollama')); const run = service.start({ input: '1' }); const done = service.active.done;
  await new Promise(resolve => setTimeout(resolve, 5));
  if (cancel) await service.cancel(run.id); else await done;
  assert.equal(service.get(run.id).status, cancel ? 'cancelled' : 'timed_out'); assert.equal(service.active, null);
});
test('service supports repeated worker transitions', async () => {
  let count = 0;
  const service = new RunService({ request: async () => response(count++ < 2 ? toolReply('ollama') : finalReply('ollama')) });
  service.configure(settings('ollama')); const run = service.start({ input: 'Solve' }); await service.active.done;
  assert.equal(service.get(run.id).status, 'completed'); assert.equal(service.get(run.id).result.tools.length, 2);
});

test('current run service rejects concurrent work and redacts network credentials', async () => {
  let rejectRequest;
  const service = new RunService({ request: async () => new Promise((_resolve, reject) => { rejectRequest = reject; }) });
  service.configure({ ...settings('ollama'), apiKey: 'private-key' });
  const run = service.start({ input: 'private-question' });
  const done = service.active.done;
  assert.throws(() => service.start({ input: 'second' }), /already running/);
  await Promise.resolve(); rejectRequest(Error('network private-key'));
  await done;
  const result = service.get(run.id);
  assert.equal(result.status, 'failed'); assert.equal(service.active, null);
  assert.doesNotMatch(JSON.stringify(result), /private-key/);
  assert.doesNotMatch(JSON.stringify(result.events), /private-question/);
});

test('settings tests use draft configuration and never apply it', async () => {
  const service = new RunService({ request: async (_url, options) => {
    assert.equal(JSON.parse(options.body).model, 'draft');
    return response(finalReply('ollama'));
  } });
  service.configure(settings('ollama'));
  await service.settingOperation('test', { ...settings('ollama'), model: 'draft' });
  assert.equal(service.publicSettings().model, 'test'); assert.equal(service.active, null);
});
