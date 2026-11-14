import { appRoot, runtimeDirectory } from '../platform/runtime.js';
import type { ToolDefinition } from '../shared/tools.js';
const fs = require('node:fs/promises') as typeof import('node:fs/promises'), sync = require('node:fs') as typeof import('node:fs'), path = require('node:path') as typeof import('node:path'), os = require('node:os') as typeof import('node:os'), { spawn } = require('node:child_process') as typeof import('node:child_process'), { createHash } = require('node:crypto') as typeof import('node:crypto');
const lock = JSON.parse(sync.readFileSync(path.join(appRoot, 'engine/lean-lock.json'), 'utf8').replace(/^\uFEFF/, ''));
function runtime() { const root = runtimeDirectory('lean-runtime'); const exe = path.join(root, 'bin/lean.exe'); if (!sync.existsSync(exe))
    throw Object.assign(Error('Bundled Lean toolchain is missing.'), { code: 'RUNTIME_MISSING' }); return { root, exe }; }
function runProcess(exe: any, args: any, cwd: any, signal: AbortSignal, progress: (stage: string, message: string) => void, timeoutMs = 30000) { return new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
}>((resolve, reject) => { signal.throwIfAborted(); const child = spawn(exe, args, { cwd, windowsHide: true, env: { SystemRoot: process.env.SystemRoot, WINDIR: process.env.WINDIR, TEMP: cwd, TMP: cwd, LEAN_PATH: '', LEAN_SRC_PATH: '' }, stdio: ['ignore', 'pipe', 'pipe'] }); let stdout = '', stderr = '', bytes = 0, failure: Error | undefined, killTask: import("node:child_process").ChildProcess | undefined; const kill = () => { if (killTask || !child.pid)
    return; killTask = spawn(path.join(process.env.SystemRoot!, 'System32/taskkill.exe'), ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' }); killTask.on('error', () => child.kill()); }; const abort = () => { failure = Object.assign(Error('Lean check cancelled.'), { code: 'CANCELLED' }); kill(); }; signal.addEventListener('abort', abort, { once: true }); if (signal.aborted)
    abort(); const timer = setTimeout(() => { failure = Object.assign(Error('Lean check exceeded its deadline.'), { code: 'TIMED_OUT' }); kill(); }, timeoutMs); for (const [stream, key] of [[child.stdout, 'stdout'], [child.stderr, 'stderr']] as const) {
    stream.setEncoding('utf8');
    stream.on('data', chunk => { bytes += Buffer.byteLength(chunk); if (bytes > 1024 * 1024) {
        failure = Object.assign(Error('Lean diagnostics exceed 1 MB.'), { code: 'OUTPUT_LIMIT' });
        kill();
        return;
    } if (key === 'stdout')
        stdout += chunk;
    else
        stderr += chunk; });
} child.on('error', () => failure = Object.assign(Error('Cannot start bundled Lean compiler.'), { code: 'ENGINE_START_FAILED' })); child.on('close', code => { clearTimeout(timer); signal.removeEventListener('abort', abort); if (failure)
    reject(failure);
else
    resolve({ code, stdout, stderr }); }); }); }
function diagnostics(stdout: any, stderr: any) { const messages = []; let unparsed = ''; for (const line of stdout.split(/\r?\n/)) {
    if (!line.trim())
        continue;
    try {
        const x = JSON.parse(line);
        if (x.severity || x.message) {
            messages.push({ severity: x.severity || 'information', message: String(x.data ?? x.message ?? ''), line: x.pos?.line ?? null, column: x.pos?.column === undefined ? null : x.pos.column + 1, endLine: x.endPos?.line ?? null, endColumn: x.endPos?.column === undefined ? null : x.endPos.column + 1 });
        }
        else
            unparsed += line + '\n';
    }
    catch {
        unparsed += line + '\n';
    }
} if (stderr.trim())
    messages.push({ severity: 'error', message: stderr.slice(0, 16000), line: null, column: null }); return { messages, unparsed: unparsed.slice(0, 16000) }; }
class LeanWorkspace {
    directory: string | null;
    attempt: number;
    constructor() { this.directory = null; this.attempt = 0; }
    async root() { if (!this.directory) {
        this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'math-lean-'));
        await fs.writeFile(path.join(this.directory, 'lean-toolchain'), 'leanprover/lean4:v' + lock.version + '\n');
        await fs.writeFile(path.join(this.directory, 'lakefile.toml'), 'name = "MathWorkbench"\nversion = "0.1.0"\n');
        await fs.writeFile(path.join(this.directory, 'lake-manifest.json'), JSON.stringify({ version: '1.1.0', packages: [], name: 'MathWorkbench' }));
    } return this.directory; }
    async check(source: string, { signal, progress }: {
        signal: any;
        progress: any;
    }) { const toolchain = runtime(), root = await this.root(), attempt = ++this.attempt, dir = path.join(root, 'attempt-' + attempt); await fs.mkdir(dir); const file = 'Check.lean', hash = createHash('sha256').update(source).digest('hex'); await fs.writeFile(path.join(dir, file), source, 'utf8'); progress('solving', 'Lean ' + lock.version + ' · compiling attempt ' + attempt); const version = await runProcess(toolchain.exe, ['--version'], dir, signal, progress, 5000); if (version.code !== 0 || !version.stdout.includes('version ' + lock.version))
        throw Object.assign(Error('Lean toolchain version does not match lock.'), { code: 'RUNTIME_MISMATCH' }); let result; try {
        result = await runProcess(toolchain.exe, ['--json', '-M', '1024', '-T', '200000', 'Check.lean'], dir, signal, progress);
    }
    catch (error) {
        if (signal.aborted)
            throw error;
        return this.report({ attempt, source, hash, status: 'resource_error', exitCode: null, diagnostics: [{ severity: 'error', message: error.message, line: null, column: null }], code: error.code || 'LEAN_ERROR', compiler: version.stdout.trim() });
    } const redact = (text: string) => [toolchain.root, dir, root].reduce((value, local) => value.split(local).join('[Lean workspace]').split(local[0].toLowerCase() + local.slice(1)).join('[Lean workspace]'), text); const parsed = diagnostics(redact(result.stdout), redact(result.stderr)); const hasError = parsed.messages.some(x => x.severity === 'error'); const warnings = parsed.messages.filter(x => x.severity === 'warning'); const holes = warnings.some(x => /sorry|declaration uses.*sorry/i.test(x.message)); const status = result.code !== 0 || hasError ? 'compile_error' : holes ? 'incomplete' : warnings.length ? 'compiled_with_warnings' : 'compiled'; progress('verifying', 'Lean compilation ' + status + ' · ' + parsed.messages.length + ' diagnostics'); return this.report({ attempt, source, hash, status, exitCode: result.code, diagnostics: parsed.messages, rawOutput: parsed.unparsed, compiler: version.stdout.trim() }); }
    report(report: any) { const passed = report.status === 'compiled'; const view = { kind: 'proof_report', title: 'Lean compilation check', ...report, version: lock.version, trust: 'Compilation only. No independent checker or axiom audit; the formal statement must be reviewed.' }; return { result: { ...view, source: undefined }, views: [view], error: ['compile_error', 'resource_error', 'incomplete'].includes(report.status) ? { code: report.code || 'LEAN_CHECK_FAILED', message: report.status === 'incomplete' ? 'Incomplete proof (sorry). Repair the proof and check again.' : 'Lean check failed. Use the diagnostics to repair and recheck.' } : null, diagnostics: { engine: 'Lean', version: lock.version, attempt: report.attempt, sourceHash: report.hash, exitCode: report.exitCode }, verification: { status: 'not_independently_verified', scope: view.trust }, warnings: [view.trust] }; }
    async clear() { const root = this.directory; this.directory = null; if (root && path.dirname(root) === os.tmpdir() && path.basename(root).startsWith('math-lean-'))
        await fs.rm(root, { recursive: true, force: true }); }
}
function leanDefinitions(workspace: LeanWorkspace): ToolDefinition[] { return [{ name: 'lean_project', version: '1.0.0', operation: 'inspect', timeoutMs: 5000, description: 'Inspect the pinned bundled Lean toolchain. Core/Std/Lean libraries only; mathlib is not installed and no dependencies are downloaded during solving.', parameters: { type: 'object', properties: {}, additionalProperties: false }, async execute() { runtime(); await workspace.root(); return { result: { version: lock.version, libraries: lock.libraries, mathlib: false, mode: 'local-workspace', networkDependencies: false } }; } }, { name: 'lean_check', version: '1.0.0', operation: 'compile', timeoutMs: 35000, description: 'Compile a complete Lean source file with the pinned Lean toolchain and return line/column diagnostics and a source hash. Use import Std for standard tactics. On error, inspect diagnostics, fix the SAME intended theorem and call again. Never replace an intended statement with an easier theorem, add axioms or sorry to obtain success. No mathlib. Checks are compilation only, NOT independent proof verification. Do not execute unrelated IO, metaprograms or network operations. Each attempt is an immutable source snapshot.', parameters: { type: 'object', properties: { source: { type: 'string', maxLength: 65536 } }, required: ['source'], additionalProperties: false }, execute: ({ source }, ctx) => workspace.check(source, ctx) }]; }
export { LeanWorkspace, leanDefinitions, diagnostics, runtime, runProcess };
