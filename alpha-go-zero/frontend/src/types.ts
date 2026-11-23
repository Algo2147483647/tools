export interface Net {
  size: number; arch: string; blocks: number; width: number; heads: number; auxiliary: boolean; rules: string
}
export interface Config {
  net: Net; experiment: string; seed: number; device: string; sims: number; games: number; lanes: number
  steps: number; batch: number; pairs: number; window: number; lr: number; warmup: number; decay_steps: number
  reuse_limit: number; c_puct: number; max_moves: number; amp: boolean
  selfplay_search: string; sampler: string; learner_gpus: number; arena_workers: number; wall_minutes: number
}
export interface Model {
  id: string; step: number; experiment: string; registry: string; run: string; net: Net; champion: boolean; origin: string; created: number
  gate: {published:boolean;eligible:boolean}|null
}
export interface Job {
  id: string; state: string; kind: string; phase: string; epoch: number; step: number; done: number; total: number
  config: Config; rounds: number; source: string|null; checkpoint: boolean; created: number; error?: string
}
export interface Log {
  time: number; event: string; loss?: number; policy?: number; value?: number; grad?: number; step?: number; epoch?: number; reason?: string
  new_positions?: number; truncated?: number; duplicates?: number; net_positions?: number; sampling_seconds?: number; reuse?: number
}
export interface Detail extends Job {events: Log[]; reports: string[]; stop_requested: boolean}
export interface Overview {models: Model[]; runs: Job[]; presets: Record<string,Config>}
export interface Position {
  id: string; size: number; grid: number[]; turn: number; done: boolean; passes: number; margin: number|null; legal: number[]
  last: number|null; ply: number; moves: number; human: number; model: string|null; analysis: {visits:number[]; value:number}|null
}
export interface Report {
  kind?: string; candidate: string; incumbent: string; family_lower95?: number|null
  wins: number; losses: number; draws: number; complete_pairs: number; planned_pairs: number; paired_score: number|null
  lower95: number|null; unfinished: number; published: boolean; eligible: boolean; games: {sgf: string; margin: number|null}[]
}
export const phases: Record<string,string> = {startup:'准备中',selfplay:'自我对弈',learn:'网络更新',arena:'成对比赛',finished:'已结束'}
export const statuses: Record<string,string> = {starting:'启动中',running:'运行中',stopping:'停止中',completed:'已完成',failed:'失败',interrupted:'意外中断',stopped:'已停止'}
export const active = (r: Job) => ['starting','running','stopping'].includes(r.state)
export const short = (s:string) => s.slice(0,10)
export const date = (stamp:number) => new Date(stamp*1000).toLocaleString('zh-CN',{month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})
export const pct = (x:number|null) => x==null?'—':(100*x).toFixed(1)+'%'
export async function api<T>(path:string, data?:unknown):Promise<T> {
  const res = await fetch('/api/'+path,data===undefined?{}:{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
  if (!res.ok) {
    const detail = await res.json().catch(()=>({detail:res.statusText}))
    throw Error(typeof detail.detail==='string'?detail.detail:JSON.stringify(detail.detail))
  }
  return res.json()
}
