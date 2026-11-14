export interface Settings {provider:string;baseUrl:string;model:string;maxTokens:number;hasKey?:boolean;apiKey?:string;keepApiKey?:boolean}
export interface Dataset {id:string;name:string;rows:number;columns:{name:string}[];sha256:string}
export interface Artifact {id:string;kind:string;title?:string}
export interface ToolOutput {status:string;result:unknown;diagnostics:Record<string,unknown>;verification:{status:string;scope?:string;checks?:{name:string;passed:boolean}[]};artifacts:Artifact[];assumptions:string[];warnings:string[];error?:{code:string;message:string}}
export interface Block {id:string;kind:'text'|'tool';text?:string;name?:string;operation?:string;input?:unknown;status:string;startedAt:string;finishedAt?:string;compatibility?:string;usage?:Record<string,number>;limits?:{timeoutMs:number};output?:ToolOutput;progressEvents?:{timestamp:string;message:string;stage:string}[]}
export interface Run {id:string;input:string;settings:Settings;status:string;createdAt:string;finishedAt?:string;revision:number;events:{timestamp:string;stage:string;message:string}[];blocks:Block[];datasets:Dataset[];textBytes:number;error?:{message:string};result?:{truncated?:boolean}}
export interface Patch {runId:string;revision:number;event:Record<string,unknown>}
export interface Edit {id:string;baseText:string;text:string}
export interface View {kind:string;title:string;data?:string;latex?:string;columns?:string[];rows?:(string|number|null)[][];totalRows?:number}
export interface Bootstrap {presets:Record<string,{label:string;baseUrl:string}>;settings:Settings|null;runs:Run[];cachedModels?:string[];settingsError?:string}
export interface EditorApi {getMarkdown():string;setMarkdown(text:string):void;destroy():void;focus():void;on(event:string,callback:()=>void):void;moveCursorToEnd():void;insertText(text:string):void}
declare global {interface Window {workspace:{platform:string;command(name:string,payload?:unknown):Promise<{ok:boolean;value:unknown;error?:{message:string}}>;onRun(callback:(run:Run)=>void):()=>void;onDelta(callback:(patch:Patch)=>void):()=>void;onEdit(callback:(edit:Edit)=>void):()=>void};toastui:{Editor:new(options:Record<string,unknown>)=>EditorApi};mathMarkdown:{renderMarkdown(text:string):string};liveMath:unknown}}
export async function command<T=void>(name:string,payload?:unknown):Promise<T>{const response=await window.workspace.command(name,payload);if(!response.ok)throw Error(response.error?.message||'Request failed');return response.value as T;}
