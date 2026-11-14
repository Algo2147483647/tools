import {executeProcess} from '../platform/executor.js';
import {engineFile} from '../platform/runtime.js';
const fs = require('node:fs/promises') as typeof import('node:fs/promises'), sync = require('node:fs') as typeof import('node:fs'), os = require('node:os') as typeof import('node:os'), path = require('node:path') as typeof import('node:path');
const { locations } = require('./math-client.js') as typeof import('./math-client.js');
class CodeWorkspace {
    directory: string | null;
    sequence: number;
    constructor() { this.directory = null; this.sequence = 0; }
    async root() { if (!this.directory)
        this.directory = await fs.mkdtemp(path.join(os.tmpdir(), 'math-ai-workspace-')); return this.directory; }
    async file(name: string, existing = false) { if (typeof name !== 'string' || !name || name.length > 200 || path.isAbsolute(name) || name.split(/[\\/]/).some(x => x === '..' || !x))
        throw Error('Use a relative workspace filename.'); const root = await this.root(), target = path.resolve(root, name); if (!target.startsWith(root + path.sep))
        throw Error('File is outside workspace.'); let ancestor = existing ? target : path.dirname(target); const real = await fs.realpath(ancestor); if (real !== root && !real.startsWith(root + path.sep))
        throw Error('Workspace symlinks cannot escape the workspace.'); return target; }
    async list() { const root = await this.root(), result = []; for (const item of await fs.readdir(root, { withFileTypes: true })) {
        if (!item.isFile())
            continue;
        const stat = await fs.stat(path.join(root, item.name));
        result.push({ name: item.name, bytes: stat.size });
    } return result.slice(0, 100); }
    async execute(code: string, { signal, progress, deadline = Date.now()+30000, callId = "workspace" }: {
        deadline?: number;
        callId?: string;
        signal: any;
        progress: any;
    }) {
        const root = await this.root(), filename = 'run-' + (++this.sequence) + '.py';
        await fs.writeFile(path.join(root, filename), code);
        const runtime = locations(), script = engineFile('code_worker.py');
        progress('solving', 'Running Python in local workspace: ' + filename);
        signal.throwIfAborted();
        const remaining = deadline-Date.now();
        if(remaining<=0)throw Object.assign(Error('Parent deadline exhausted.'),{code:'TIMED_OUT'});
        let pending='';const subcalls=new Map<string,any>();
        const onStderr=(chunk:string)=>{pending+=chunk;let end;while((end=pending.indexOf('\n'))>=0){const line=pending.slice(0,end);pending=pending.slice(end+1);if(!line.startsWith('MATH_EVENT '))continue;const event=JSON.parse(line.slice(11));if(typeof event.callId!=='string'||event.parentCallId!==callId)continue;subcalls.set(event.callId,event);const trace=structuredClone(event);if(trace.response?.ok)trace.response.value.views=(trace.response.value.views||[]).map((v:any)=>({kind:v.kind,title:v.title}));progress('solving','MATH_CALL '+JSON.stringify(trace));}};
        let response;
        try{response=await executeProcess({executable:runtime.python,args:['-I','-B',script],cwd:root,signal,timeoutMs:remaining,onStderr,input:JSON.stringify({code,filename,deadline,parentCallId:callId}),maxOutputBytes:8*1024*1024,env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:root,TMP:root,MPLCONFIGDIR:root,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
        }catch(error){for(const event of subcalls.values())if(event.status==='running'){event.status=signal.aborted?'cancelled':'failed';event.error={message:error.message};progress('solving','MATH_CALL '+JSON.stringify(event));}throw error;}
        
        if(response.code!==0)throw Error('Python stopped before returning a result.');
        const output=JSON.parse(response.stdout);
        const files = await this.list(), views = [...subcalls.values()].flatMap(event=>event.response?.ok?event.response.value.views||[]:[]);
        for (const file of files.filter(x => /\.png$/i.test(x.name) && x.bytes <= 3 * 1024 * 1024).slice(-6)) {
            const value = await fs.readFile(await this.file(file.name, true));
            if (value.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])))
                views.push({ kind: 'image', title: file.name, mimeType: 'image/png', data: value.toString('base64') });
        }
        progress('solving', output.error ? 'Python returned an error' : 'Python finished');
        return { error: output.error ? { code: "CODE_ERROR", message: output.error.type + ": " + output.error.message } : null, result: { ...output, files, filename, subcalls:[...subcalls.values()] }, views, diagnostics: { engine: 'Python', executionMode: 'local-workspace', exitStatus: output.error ? 'error' : 'ok' }, verification: { status: 'not_checked', scope: 'Generated code output is not a mathematical proof.' } };
    }
    async clear() { const directory = this.directory; this.directory = null; if (directory && path.dirname(directory) === os.tmpdir() && path.basename(directory).startsWith('math-ai-workspace-'))
        await fs.rm(directory, { recursive: true, force: true }); }
}
function workspaceDefinition(workspace: any) { return { name: 'code_workspace', version: '1.0.0', operations: ['run', 'list', 'read', 'write'], timeoutMs: 30000, description: 'Prefer declared mathematics tools for covered tasks. For loops and custom orchestration, reuse from math_engine import solve, batch. solve(tool="exact_math", arguments={"expression":"1/3+1/6"}) returns {schemaVersion,ok,value/error}; batch(tool=...,arguments_list=[...]) returns individual responses, sharing the parent deadline. Calls are traced automatically. Direct third-party code is an unverified custom path. Run your own Python code in a local workspace, or list/read/write its files. Python has sympy,numpy,scipy,pandas,matplotlib,cvxpy and math_engine; use matplotlib Agg and save PNG charts. Files persist across calls in this session. Run code for general transformations (JSON formatting/compression), algorithms and experiments. No package installation. This is a local process, not a filesystem security sandbox. Keep all generated files in the workspace and do not access unrelated host files or network. Return code errors honestly. Use editor_document replace with a generated UTF-8 file for writeback.', parameters: { type: 'object', properties: { operation: { type: 'string', enum: ['run', 'list', 'read', 'write'] }, code: { type: 'string', maxLength: 131072 }, file: { type: 'string', maxLength: 200 }, text: { type: 'string', maxLength: 262144, minLength: 0 } }, required: ['operation'], additionalProperties: false }, async execute(args: any, context: any) { if (args.operation === 'run') {
        if (!args.code)
            throw Error('run requires code.');
        return workspace.execute(args.code, context);
    } if (args.operation === 'list')
        return { result: { files: await workspace.list() } }; const target = await workspace.file(args.file, args.operation === 'read'); if (args.operation === 'write') {
        if (typeof args.text !== 'string')
            throw Error('write requires text.');
        await fs.writeFile(target, args.text);
        return { result: { file: args.file, bytes: Buffer.byteLength(args.text) } };
    } if ((await fs.stat(target)).size > 262144)
        throw Error('File exceeds 256 KB.'); return { result: { file: args.file, text: await fs.readFile(target, 'utf8') } }; } }; }
export { CodeWorkspace, workspaceDefinition };
