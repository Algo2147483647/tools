import {executeProcess} from '../platform/executor.js';
import { runtimeDirectory, mathematicsFile } from '../platform/runtime.js';
import type { ToolValue } from '../shared/tools.js';
const fs = require('node:fs') as typeof import('node:fs');
const path = require('node:path') as typeof import('node:path');
import Ajv from 'ajv';
import {mathWireSchemas, type MathRequest, type MathResponse} from './math-contracts.generated.js';
const ajv = new Ajv({strict:false});
const validRequest = ajv.compile(mathWireSchemas.request);
const validResponse = ajv.compile(mathWireSchemas.response);
const os = require('node:os') as typeof import('node:os');
function locations() { return { python: path.join(runtimeDirectory('math-runtime', 'python-engine'), 'python.exe'), script: mathematicsFile('worker.py') }; }
async function executeMath(request: MathRequest, signal: AbortSignal, progress: (stage:string,message:string)=>void = () => {}): Promise<ToolValue> {
 if(!validRequest(request))throw Object.assign(Error('Invalid mathematical request envelope.'),{code:'INVALID_ARGUMENT'});
 const {python,script}=locations();const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'math-workspace-'));
 try{
  progress('solving','Running mathematical engine');
  const output=await executeProcess({executable:python,args:['-I','-B',script],cwd:temporary,signal,input:JSON.stringify(request),env:{SystemRoot:process.env.SystemRoot,WINDIR:process.env.WINDIR,TEMP:temporary,TMP:temporary,MPLCONFIGDIR:temporary,OPENBLAS_NUM_THREADS:'1',OMP_NUM_THREADS:'1'}});
  if(output.code!==0)throw Object.assign(Error('Mathematical process exited unsuccessfully.'),{code:'ENGINE_EXIT'});
  const reply=JSON.parse(output.stdout) as MathResponse;if(!validResponse(reply))throw Object.assign(Error('Invalid mathematics response.'),{code:'ENGINE_PROTOCOL'});
  if(!reply.ok)throw Object.assign(Error(reply.error.message),{code:reply.error.code});return reply.value as unknown as ToolValue;
 }finally{await fs.promises.rm(temporary,{recursive:true,force:true});}
}
export { executeMath, locations };
