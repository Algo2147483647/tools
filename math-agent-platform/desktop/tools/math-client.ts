import { runtimeDirectory, mathematicsFile } from '../platform/runtime.js';
import type { ToolValue } from '../shared/tools.js';
const { spawn } = require('node:child_process') as typeof import('node:child_process');
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
import Ajv from 'ajv';
import {mathWireSchemas, type MathRequest, type MathResponse} from './math-contracts.generated.js';
const ajv = new Ajv({strict:false});
const validRequest = ajv.compile(mathWireSchemas.request);
const validResponse = ajv.compile(mathWireSchemas.response);
const os = require('node:os') as typeof import('node:os');
function locations() { return { python: path.join(runtimeDirectory('math-runtime', 'python-engine'), 'python.exe'), script: mathematicsFile('worker.py') }; }
function executeMath(request: MathRequest, signal: AbortSignal, progress: (stage: string, message: string) => void = () => { }) {
    return new Promise<ToolValue>((resolve, reject) => {
        if (!validRequest(request)) return reject(Object.assign(Error('Invalid mathematical request envelope.'), {code:'INVALID_ARGUMENT'}));
        if (signal.aborted)
            return reject(Object.assign(Error('Calculation cancelled.'), { code: 'CANCELLED' }));
        const { python, script } = locations();
        if (!fs.existsSync(python) || !fs.existsSync(script))
            return reject(Object.assign(Error('Bundled mathematics runtime is missing. Reinstall the application.'), { code: 'RUNTIME_MISSING' }));
        const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'math-workspace-'));
        const env = { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: temporary, TMP: temporary, MPLCONFIGDIR: temporary, OPENBLAS_NUM_THREADS: '1', OMP_NUM_THREADS: '1', MKL_NUM_THREADS: '1', NUMEXPR_NUM_THREADS: '1' };
        const child = spawn(python, ['-I', '-B', script], { windowsHide: true, cwd: temporary, env, stdio: ['pipe', 'pipe', 'pipe'] });
        let stdout = '', bytes = 0, failure: Error | null = null;
        const abort = () => { failure ||= Object.assign(Error('Calculation cancelled.'), { code: 'CANCELLED' }); child.kill(); };
        signal.addEventListener('abort', abort, { once: true });
        if (signal.aborted)
            abort();
        const timeout = setTimeout(() => { failure = Object.assign(Error('Calculation exceeded 30 seconds.'), { code: 'TIMED_OUT' }); child.kill(); }, 30000);
        child.stdout.setEncoding('utf8');
        child.stdout.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 8 * 1024 * 1024) {
            failure = Object.assign(Error('Calculation output exceeds 8 MB.'), { code: 'OUTPUT_LIMIT' });
            child.kill();
        }
        else
            stdout += chunk; });
        child.stderr.resume(); // Worker diagnostics must not expose host paths in UI.
        child.on('error', () => { failure = Object.assign(Error('Unable to start mathematical engine.'), { code: 'ENGINE_START_FAILED' }); });
        child.stdin.on('error', () => { });
        child.on('close', code => {
            clearTimeout(timeout);
            signal.removeEventListener('abort', abort);
            fs.rm(temporary, { recursive: true, force: true }, () => { });
            if (failure)
                return reject(failure);
            if (code !== 0)
                return reject(Object.assign(Error('Mathematical engine stopped before returning a result; resource limits may have been reached.'), { code: 'ENGINE_EXIT' }));
            try {
                const output = JSON.parse(stdout) as MathResponse;
                if (!validResponse(output)) throw Object.assign(Error('Invalid mathematical response envelope.'), {code:'ENGINE_PROTOCOL'});
                if (!output.ok)
                    throw Object.assign(Error(output.error?.message || 'Mathematical calculation failed.'), { code: output.error?.code || 'ENGINE_ERROR' });
                progress('solving', 'Mathematical computation finished');
                resolve(output.value as unknown as ToolValue);
            }
            catch (error) {
                reject(error.code ? error : Object.assign(Error('Invalid mathematical engine response.'), { code: 'ENGINE_PROTOCOL' }));
            }
        });
        progress('solving', 'Starting isolated mathematical engine');
        child.stdin.end(JSON.stringify(request));
    });
}
export { executeMath, locations };
