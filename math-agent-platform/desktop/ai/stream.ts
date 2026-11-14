import type { JsonObject } from '../shared/tools.js';
const { readJson } = require('./providers.js') as typeof import('./providers.js');
const fail = (message: string, code = 'STREAM_INVALID') => Object.assign(Error(message), { code });
// SSE/NDJSON framing operates on decoded characters, not network chunks.
async function* frames(response: Response, signal: AbortSignal, { idleMs = 45000, maxBytes = 8 * 1024 * 1024 } = {}) {
    const reader = response.body!.getReader(), decoder = new TextDecoder('utf-8', { fatal: true });
    const sse = (response.headers.get('content-type') || '').includes('text/event-stream');
    let buffer = '', data = [], total = 0;
    const abort = () => { reader.cancel().catch(() => { }); };
    signal.addEventListener('abort', abort, { once: true });
    try {
        while (true) {
            signal.throwIfAborted();
            let timer: ReturnType<typeof setTimeout> | undefined;
            const chunk = await Promise.race([reader.read(), new Promise<ReadableStreamReadResult<Uint8Array>>((_, reject) => { timer = setTimeout(() => { reject(fail('Model stream was idle for too long.', 'TIMED_OUT')); abort(); }, idleMs); })]).finally(() => clearTimeout(timer));
            signal.throwIfAborted();
            if (!chunk.done) {
                total += chunk.value.byteLength;
                if (total > maxBytes)
                    throw fail('Model stream exceeds 8 MB.', 'OUTPUT_LIMIT');
            }
            buffer += decoder.decode(chunk.done ? undefined : chunk.value, { stream: !chunk.done });
            if (buffer.length > 1024 * 1024)
                throw fail('Stream frame exceeds 1 MB.', 'OUTPUT_LIMIT');
            let end;
            while ((end = buffer.indexOf('\n')) !== -1) {
                const line = buffer.slice(0, end).replace(/\r$/, '');
                buffer = buffer.slice(end + 1);
                if (sse) {
                    if (!line) {
                        if (data.length) {
                            yield data.join('\n');
                            data = [];
                        }
                    }
                    else if (line.startsWith('data:'))
                        data.push(line.slice(5).replace(/^ /, ''));
                }
                else if (line.trim())
                    yield line;
            }
            if (chunk.done)
                break;
        }
        if (sse) {
            if (buffer.startsWith('data:'))
                data.push(buffer.slice(5).trimStart());
            if (data.length)
                yield data.join('\n');
        }
        else if (buffer.trim())
            yield buffer;
    }
    finally {
        signal.removeEventListener('abort', abort);
        await reader.cancel().catch(() => { });
        reader.releaseLock();
    }
}
function accumulator(provider: string, onText: (text: string) => void, onReasoning: (text: string) => void = () => {}) {
    const message: JsonObject = { role: 'assistant', content: '' }, calls = new Map(), blocks = new Map(), parts: JsonObject[] = [];
    let finish: string | null = null, ended = false, usage: JsonObject | null = null, textBytes = 0;
    const text = (value: unknown) => { if (typeof value !== 'string' || !value)
        return; textBytes += Buffer.byteLength(value); if (textBytes > 1024 * 1024)
        throw fail('Visible answer exceeds 1 MB.', 'OUTPUT_LIMIT'); onText(value); };
    return {
        accept(j: any) {
            const reasoning = j.choices?.[0]?.delta?.reasoning_content || j.message?.thinking || (j.delta?.type === 'thinking_delta' ? j.delta.thinking : '');
            if (typeof reasoning === 'string' && reasoning) onReasoning(reasoning);
            for (const part of j.candidates?.[0]?.content?.parts || []) if (part.thought && part.text) onReasoning(part.text);
            if (j.error || j.type === 'error')
                throw fail('Model service reported a streaming error.', 'PROVIDER_ERROR');
            if (provider === 'anthropic') {
                if (j.type === 'message_start')
                    usage = j.message?.usage;
                if (j.type === 'content_block_start') {
                    const b = structuredClone(j.content_block);
                    blocks.set(j.index, b);
                    if (b.type === 'text')
                        text(b.text);
                }
                if (j.type === 'content_block_delta') {
                    const b = blocks.get(j.index), d = j.delta;
                    if (!b)
                        throw fail('Unknown content block.');
                    if (d.type === 'text_delta') {
                        b.text = (b.text || '') + d.text;
                        text(d.text);
                    }
                    else if (d.type === 'input_json_delta')
                        b.partial = (b.partial || '') + d.partial_json;
                    else if (d.type === 'thinking_delta')
                        b.thinking = (b.thinking || '') + d.thinking;
                    else if (d.type === 'signature_delta')
                        b.signature = (b.signature || '') + d.signature;
                }
                if (j.type === 'content_block_stop') {
                    const b = blocks.get(j.index);
                    if (b?.partial !== undefined) {
                        try {
                            b.input = JSON.parse(b.partial);
                        }
                        catch {
                            throw fail('Incomplete tool arguments.');
                        }
                        delete b.partial;
                    }
                }
                if (j.type === 'message_delta') {
                    finish = j.delta?.stop_reason || finish;
                    usage = { ...usage, ...j.usage };
                }
                if (j.type === 'message_stop')
                    ended = true;
            }
            else if (provider === 'gemini') {
                const c = j.candidates?.[0];
                if (j.promptFeedback?.blockReason)
                    throw fail('The model declined this request.', 'REFUSED');
                for (const part of c?.content?.parts || []) {
                    parts.push(structuredClone(part));
                    if (!part.thought)
                        text(part.text);
                }
                if (c?.finishReason) {
                    finish = c.finishReason;
                    ended = true;
                }
                usage = j.usageMetadata || usage;
            }
            else {
                const choice = j.choices?.find((c: JsonObject) => c.index === 0) || j.choices?.[0];
                const d = provider === 'ollama' ? j.message : choice?.delta;
                if (d?.refusal)
                    throw fail('The model declined this request.', 'REFUSED');
                if (d?.content) {
                    message.content += d.content;
                    text(d.content);
                }
                // Provider continuation fields stay in model context; they are not displayed as a fabricated explanation.
                if (d?.reasoning_content)
                    message.reasoning_content = (message.reasoning_content || '') + d.reasoning_content;
                if (d?.thinking)
                    message.thinking = (message.thinking || '') + d.thinking;
                for (const [ordinal, tool] of (d?.tool_calls || []).entries()) {
                    const index = tool.index ?? ordinal;
                    const current = calls.get(index) || { id: '', type: 'function', function: { name: '', arguments: '' } };
                    if (tool.id)
                        current.id += tool.id;
                    if (tool.function?.name)
                        current.function.name += tool.function.name;
                    if (tool.function?.arguments !== undefined) {
                        if (typeof tool.function.arguments === 'string')
                            current.function.arguments += tool.function.arguments;
                        else
                            current.function.arguments = JSON.stringify(tool.function.arguments);
                    }
                    calls.set(index, current);
                    if (calls.size > 8 || current.function.arguments.length > 65536)
                        throw fail('Tool request exceeds limits.', 'TOOL_LIMIT');
                }
                if (provider === 'ollama' && j.done) {
                    finish = j.done_reason || 'stop';
                    ended = true;
                    usage = { input: j.prompt_eval_count, output: j.eval_count };
                }
                else if (choice?.finish_reason) {
                    finish = choice.finish_reason;
                    ended = true;
                }
                usage = j.usage || usage;
            }
        },
        finish() {
            if (!ended || !finish)
                throw fail('Model stream ended before completion.', 'STREAM_INTERRUPTED');
            if (provider === 'anthropic') {
                const content = [...blocks.values()];
                if (content.some(b => b.partial !== undefined))
                    throw fail('Tool arguments did not complete.');
                return { content, stop_reason: finish, usage };
            }
            if (provider === 'gemini')
                return { candidates: [{ content: { role: 'model', parts }, finishReason: finish }], usageMetadata: usage };
            if (calls.size)
                message.tool_calls = [...calls.values()];
            return provider === 'ollama' ? { message, done: true, done_reason: finish, usage } : { choices: [{ message, finish_reason: finish }], usage };
        }
    };
}
async function readReply(response: any, provider: string, signal: AbortSignal, onText: (text: string) => void, onCompatibility = () => { }, options: any, onActivity: (stage: string) => void = () => {}, onReasoning: (text: string) => void = () => {}) {
    if (!response.ok)
        return readJson(response); // Existing redacted HTTP diagnostics.
    const type = response.headers.get('content-type') || '';
    if (!/text\/event-stream|ndjson|jsonl/.test(type)) {
        onCompatibility();
        const json = await readJson(response);
        signal.throwIfAborted();
        let text = provider === 'anthropic' ? (json.content || []).filter((p: JsonObject) => p.type === 'text').map((p: JsonObject) => p.text).join('\n') : provider === 'gemini' ? (json.candidates?.[0]?.content?.parts || []).filter((p: JsonObject) => !p.thought).map((p: JsonObject) => p.text || '').join('') : provider === 'ollama' ? json.message?.content : json.choices?.[0]?.message?.content;
        if (typeof text === 'string')
            onText(text);
        return json;
    }
    let lastStage = "", lastUpdate = 0;
    const acc = accumulator(provider, onText, onReasoning);
    for await (const frame of frames(response, signal, options)) {
        if (frame.trim() === '[DONE]')
            break;
        let json;
        try {
            json = JSON.parse(frame);
        }
        catch {
            throw fail('Model stream contains invalid JSON.');
        }
        acc.accept(json);
        const delta = provider === 'ollama' ? json.message : (json.choices?.find((c: JsonObject) => c.index === 0) || json.choices?.[0])?.delta;
        const parts = json.candidates?.[0]?.content?.parts || [];
        const stage = delta?.content || json.delta?.type === 'text_delta' || parts.some((p: JsonObject) => p.text && !p.thought) ? 'answer'
            : delta?.reasoning_content || delta?.thinking || json.delta?.type === 'thinking_delta' || parts.some((p: JsonObject) => p.thought) ? 'reasoning'
            : delta?.tool_calls?.length || json.delta?.type === 'input_json_delta' || parts.some((p: JsonObject) => p.functionCall) ? 'tool_arguments' : lastStage || 'connected';
        if (stage !== lastStage || Date.now() - lastUpdate >= 500) {
            onActivity(stage); lastStage = stage; lastUpdate = Date.now();
        }
    }
    signal.throwIfAborted();
    return acc.finish();
}
export { frames, accumulator, readReply };
