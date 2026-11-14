import type {Run,Patch} from './types';
export class WorkspaceState {runs:Map<string,Run>;selectedId:string|null;activeId:string|null;receive(run:Run):boolean;delta(patch:Patch):'gap'|'applied'|'stale';get selected():Run|undefined;get busy():boolean;isStale(input:string):boolean}
