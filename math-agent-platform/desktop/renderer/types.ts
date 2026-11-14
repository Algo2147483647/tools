import type {CommandName} from '../shared/ipc';
import type {Run,Patch,Edit,EditorApi} from '../shared/contracts';
export type * from '../shared/contracts';
declare global {interface Window {workspace:{platform:string;command(name:CommandName,payload?:unknown):Promise<{ok:boolean;value:unknown;error?:{message:string}}>;onRun(callback:(run:Run)=>void):()=>void;onDelta(callback:(patch:Patch)=>void):()=>void;onEdit(callback:(edit:Edit)=>void):()=>void};toastui:{Editor:typeof import('@toast-ui/editor').default};mathMarkdown:{renderMarkdown(text:string):string};liveMath:unknown}}
export async function command<T=void>(name:CommandName,payload?:unknown):Promise<T>{const response=await window.workspace.command(name,payload);if(!response.ok)throw Error(response.error?.message||'Request failed');return response.value as T;}
