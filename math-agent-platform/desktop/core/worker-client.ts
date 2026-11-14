import type { solve } from './engine.js';
const { Worker } = require('node:worker_threads') as typeof import('node:worker_threads');
const path = require('node:path') as typeof import('node:path');
function compute(input: string, signal: AbortSignal, emit: (stage: string, message: string) => void, timeoutMs = 5000) {
    return new Promise<ReturnType<typeof solve>>((resolve, reject) => {
        if (signal.aborted)
            return reject(Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' }));
        const worker = new Worker(path.join(__dirname, 'worker.js'), { workerData: { input }, resourceLimits: { maxOldGenerationSizeMb: 64, stackSizeMb: 4 } });
        let settled = false;
        const finish = (error: Error | null, result?: ReturnType<typeof solve>) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            worker.terminate().then(() => error ? reject(error) : resolve(result!), reject);
        };
        const abort = () => finish(Object.assign(Error('Run cancelled.'), { code: 'CANCELLED' }));
        const timer = setTimeout(() => finish(Object.assign(Error('Local computation timed out.'), { code: 'TIMED_OUT' })), timeoutMs);
        signal.addEventListener('abort', abort, { once: true });
        worker.on('message', message => {
            if (settled)
                return;
            if (message.type === 'event')
                emit(message.stage, message.message);
            else if (message.type === 'result')
                finish(null, message.result);
            else
                finish(Object.assign(Error(message.error.message), { code: message.error.code }));
        });
        worker.on('error', error => finish(Object.assign(error, { code: 'WORKER_FAILED' })));
        worker.on('exit', code => { if (!settled)
            finish(Object.assign(Error(`Math worker exited before returning a result (${code}).`), { code: 'WORKER_FAILED' })); });
    });
}
export { compute };
