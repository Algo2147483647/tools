const test = require('node:test');
const assert = require('node:assert/strict');
const { validateSettings, solve, models, parseReply, chatRequest } = require('./providers.cjs');
const settings = { provider: 'openai-compatible', baseUrl: 'https://example.test/v1', model: 'test-model', apiKey: 'test-secret' };
const response = json => new Response(JSON.stringify(json), { headers: { 'Content-Type': 'application/json' } });
test('chat sends Markdown through configured service and returns labelled answer', async () => {
  const result = await solve(settings, 'x + 6 = 1', undefined, async (url, options) => {
    assert.equal(url, 'https://example.test/v1/chat/completions');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    assert.equal(JSON.parse(options.body).messages[1].content, 'x + 6 = 1');
    assert.equal(options.redirect, 'error');
    return response({ choices: [{ message: { content: '**x = -5**' }, finish_reason: 'stop' }] });
  });
  assert.equal(result.markdown, '**x = -5**'); assert.equal(result.verification, 'not_independently_verified');
});
test('rejects unsafe and credential-bearing endpoints', () => {
  for (const baseUrl of ['http://remote.test', 'file:///tmp/test', 'https://user:pass@example.test', 'https://example.test?key=secret']) assert.throws(() => validateSettings({ ...settings, baseUrl }));
  assert.equal(validateSettings({ ...settings, baseUrl: 'http://localhost:11434' }).baseUrl, 'http://localhost:11434');
});
test('native request formats and response parsing', () => {
  assert.equal(chatRequest({ ...settings, provider: 'anthropic', maxTokens: 500 }, 'test').body.max_tokens, 500);
  assert.match(chatRequest({ ...settings, provider: 'gemini' }, 'test').path, /:generateContent$/);
  assert.equal(chatRequest({ ...settings, provider: 'ollama' }, 'test').body.stream, false);
  assert.equal(parseReply('anthropic', { content: [{ type: 'text', text: 'answer' }] }).markdown, 'answer');
  assert.equal(parseReply('gemini', { candidates: [{ content: { parts: [{ thought: true, text: 'hidden' }, { text: 'answer' }] } }] }).markdown, 'answer');
  assert.equal(parseReply('ollama', { message: { content: 'answer' } }).markdown, 'answer');
});
test('truncation and refusals are explicit', () => {
  assert.equal(parseReply('openai-compatible', { choices: [{ message: { content: 'partial' }, finish_reason: 'length' }] }).truncated, true);
  assert.throws(() => parseReply('openai-compatible', { choices: [{ message: { refusal: 'no' } }] }));
});
test('HTTP failures do not echo credentials from provider bodies', async () => {
  await assert.rejects(solve(settings, 'question', undefined, async () => new Response('test-secret', { status: 401 })), error => /401/.test(error.message) && !error.message.includes('test-secret'));
});
test('invalid JSON and unsupported image input fail visibly', async () => {
  await assert.rejects(solve(settings, 'question', undefined, async () => new Response('<html>')), /invalid JSON/);
  await assert.rejects(solve(settings, '![x](data:image/png;base64,abc)', undefined), /Image inputs/);
});
test('loads models without assuming preset model availability', async () => {
  assert.deepEqual(await models({ ...settings, model: '' }, undefined, async () => response({ data: [{ id: 'b' }, { id: 'a' }] })), ['a', 'b']);
});
test('supports paginated model catalogues', async () => {
  let count = 0;
  const result = await models({ ...settings, provider: 'gemini' }, undefined, async url => {
    count++; if (count === 1) return response({ models: [{ name: 'models/a' }], nextPageToken: 'next' });
    assert.match(url, /pageToken=next/); return response({ models: [{ name: 'models/b' }] });
  }); assert.deepEqual(result, ['a', 'b']);
});
