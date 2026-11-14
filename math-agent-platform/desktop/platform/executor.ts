import {spawn} from 'node:child_process';
import path from 'node:path';
export interface ProcessRequest { executable:string;args:string[];cwd:string;env?:NodeJS.ProcessEnv;input?:string;onStderr?:(chunk:string)=>void;signal:AbortSignal;timeoutMs?:number;maxOutputBytes?:number }
const shutdownTasks = new Set<()=>Promise<void>>();
export async function shutdownProcesses(){await Promise.all([...shutdownTasks].map(stop=>stop()));}
export const activeProcesses = new Set<number>();
export function executeProcess(options:ProcessRequest):Promise<{code:number|null;stdout:string;stderr:string}> {
 return new Promise((resolve,reject)=>{
  if(options.signal.aborted)return reject(Object.assign(Error('Operation cancelled.'),{code:'CANCELLED'}));
  const child=spawn(options.executable,options.args,{cwd:options.cwd,env:options.env,windowsHide:true,detached:process.platform!=='win32',stdio:['pipe','pipe','pipe']});
  let failure:Error|undefined,closed=false,termination:Promise<void>|undefined,bytes=0,stdout='',stderr='';
  if(child.pid)activeProcesses.add(child.pid);
  const stop=(code:string,message:string)=>{
   if(closed||termination)return;failure=Object.assign(Error(message),{code});
   if(!child.pid){child.kill();return;}
   if(process.platform==='win32')termination=new Promise(done=>{
    const killer=spawn(path.join(process.env.SystemRoot||'C:/Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
    killer.once('error',()=>{child.kill();done()});killer.once('close',code=>{if(code!==0)child.kill();done()});
   });else{try{process.kill(-child.pid,'SIGKILL')}catch{child.kill('SIGKILL')}termination=Promise.resolve();}
  };
  const shutdown=()=>new Promise<void>(done=>{if(closed){done();return;}child.once('close',async()=>{await termination;done()});stop('CANCELLED','Application is closing.');});shutdownTasks.add(shutdown);
  const abort=()=>stop('CANCELLED','Operation cancelled.');options.signal.addEventListener('abort',abort,{once:true});
  const timer=setTimeout(()=>stop('TIMED_OUT','Process exceeded its deadline.'),options.timeoutMs??30000);
  for(const [stream,isOut] of [[child.stdout,true],[child.stderr,false]] as const){stream.setEncoding('utf8');stream.on('data',(chunk:string)=>{bytes+=Buffer.byteLength(chunk);if(bytes>(options.maxOutputBytes??8*1024*1024)){stop('OUTPUT_LIMIT','Process output exceeds limit.');return;}if(isOut)stdout+=chunk;else {stderr+=chunk;try{options.onStderr?.(chunk)}catch{stop('ENGINE_PROTOCOL','Invalid worker event.')}};});}
  child.stdin.on('error',()=>{});child.once('error',()=>{failure=Object.assign(Error('Unable to start process.'),{code:'ENGINE_START_FAILED'})});
  child.once('close',async code=>{closed=true;shutdownTasks.delete(shutdown);clearTimeout(timer);options.signal.removeEventListener('abort',abort);await termination;if(child.pid)activeProcesses.delete(child.pid);if(failure)reject(failure);else resolve({code,stdout,stderr});});
  if(options.signal.aborted)abort();child.stdin.end(options.input);
 });
}
