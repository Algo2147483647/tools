import { useEffect, useState } from 'react'
import { active, api, date, pct, phases, short, statuses, type Config, type Detail, type Job, type Log, type Overview, type Report } from './types'

const numeric = {seed:'Random seed',sims:'Simulations per move',games:'Games per round',lanes:'Concurrent games',steps:'Update limit per round',batch:'Batch size',
  pairs:'Evaluation opening pairs',window:'Replay window (positions)',lr:'Learning rate',reuse_limit:'Sample reuse limit',warmup:'Warmup steps',decay_steps:'Decay steps',
  c_puct:'Exploration constant',max_moves:'Move limit (0  = automatic)',wall_minutes:'Time budget (minutes, 0  = unlimited)',arena_workers:'Evaluation workers'}
type Numeric=keyof typeof numeric
function Curve({events}:{events:Log[]}) {
  const rows=events.filter(e=>e.event==='update'&&e.loss!==undefined)
  if(rows.length<2)return null
  const ys=rows.map(r=>r.loss!),low=Math.min(...ys),high=Math.max(...ys)
  const points=ys.map((v,i)=>[5+i*410/(ys.length-1),75-(v-low)*65/(high-low||1)].join(',')).join(' ')
  return <figure><figcaption>Training loss <strong>{ys.at(-1)!.toFixed(3)}</strong></figcaption>
    <svg viewBox="0 0 420 84" role="img" aria-label={'Training loss from '+ys[0].toFixed(3)+' to '+ys.at(-1)!.toFixed(3)}><path d="M5 75H415" stroke="#ccd6cc"/><polyline points={points} fill="none" stroke="#167361" strokeWidth="2.5"/></svg>
    <small>Training step {rows[0].step} – {rows.at(-1)!.step}</small></figure>
}
function Result({job,name}:{job:string;name:string}){
  const [report,setReport]=useState<Report|null>(null),[err,setErr]=useState('')
  const path='jobs/'+job+'/reports/'+name
  useEffect(()=>{let live=true;setReport(null);setErr('');api<Report>(path).then(r=>{if(live)setReport(r)}).catch(e=>{if(live)setErr(String(e))});return()=>{live=false}},[path])
  if(!report)return <p>{err||'Loading report…'}</p>
  return <div className="result"><div className="section-line"><h4>{report.kind==='league'?'Historical league · '+short(report.candidate)+' / '+short(report.incumbent):name==='report-independent'?'Independent match':'Round '+(Number(name.slice(7))+1)+' evaluation'}</h4><a href={'/api/'+path} download={name+'.json'}>Export JSON</a></div>
    <div className="metrics"><div><b>{report.wins} / {report.losses}</b><small>Candidate wins / losses</small></div><div><b>{pct(report.paired_score)}</b><small>Paired score</small></div><div><b>{pct(report.lower95)}</b><small>95% one-sided lower bound</small></div></div>
    <p className="muted">Complete opening pairs {report.complete_pairs} / {report.planned_pairs} · Unfinished games {report.unfinished} · {report.kind==='league'?'Adjusted lower bound '+pct(report.family_lower95??null):name==='report-independent'?'Independent evaluation':report.published?'Candidate promoted':report.eligible?'Champion changed':'Not promoted'}</p></div>
}
export function Tasks({mode,data,refresh}:{mode:'train'|'arena';data:Overview;refresh:()=>Promise<void>}){
  const train=mode==='train'
  const [preset,setPreset]=useState('quick9'),[cfg,setCfg]=useState<Config>({...data.presets.quick9})
  const [rounds,setRounds]=useState(1),[cand,setCand]=useState(''),[opp,setOpp]=useState('')
  const [key,select]=useState(()=>sessionStorage.getItem('zero-'+mode)||''),[detail,setDetail]=useState<Detail|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[detailError,setDetailError]=useState('')
  const rows=data.runs.filter(r=>train?r.kind==='train':true)
  const chosen=rows.find(r=>r.id===key)?.id||rows[0]?.id||''
  const d=detail?.id===chosen?detail:null
  const running=data.runs.some(active)
  const candidate=data.models.find(m=>m.id===cand)
  const peers=data.models.filter(m=>m.net.size===candidate?.net.size&&m.net.rules===candidate.net.rules&&m.id!==cand)
  useEffect(()=>{
    let live=true
    async function load(){if(!chosen){setDetail(null);return}try{const r=await api<Detail>('jobs/'+chosen);if(live){setDetail(r);setDetailError('')}}catch(e){if(live)setDetailError(String(e))}}
    void load();const timer=setInterval(load,2200)
    return()=>{live=false;clearInterval(timer)}
  },[chosen])
  function choose(id:string){select(id);sessionStorage.setItem('zero-'+mode,id)}
  async function action(fn:()=>Promise<unknown>){
    setBusy(true);setError('')
    try{await fn();await refresh()}catch(e){setError((e as Error).message)}finally{setBusy(false)}
  }
  function start(source?:string){
    return action(async()=>{
      let config=cfg
      if(!train&&candidate){config={...cfg,net:candidate.net,experiment:candidate.experiment}}
      const job=await api<Job>('jobs',{config,rounds,source:source??null,candidate:train?null:cand,incumbent:train?null:opp})
      choose(job.id)
    })
  }
  function input(k:Numeric){const decimal=['lr','reuse_limit','c_puct'].includes(k)
    return <label key={k}>{numeric[k]}<input type="number" value={cfg[k]} step={decimal||k==='wall_minutes'?'any':1}
      min={['seed','warmup','decay_steps','max_moves','wall_minutes'].includes(k)?0:decimal?0.000001:1} required
      onChange={e=>setCfg({...cfg,[k]:+e.target.value})}/></label>}
  return <section className="columns jobs"><div className="stack"><article className="card">
    <header className="card-head"><div><p className="overline">{train?'LEARNING':'ARENA'}</p><h2>{train?'Self-play training':'Evaluation arena'}</h2></div><span className="status">{running?'Compute job active':'Compute queue idle'}</span></header>
    <form onSubmit={e=>{e.preventDefault();void start()}}><div className="fields">
    {train?<><label>Training preset<select value={preset} onChange={e=>{setPreset(e.target.value);setCfg({...data.presets[e.target.value]})}}>{Object.keys(data.presets).map(k=><option key={k}>{k}</option>)}</select></label>
      <label>Experiment name<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{0,47}" value={cfg.experiment} onChange={e=>setCfg({...cfg,experiment:e.target.value})}/></label></>:
      <><label>Candidate model<select value={cand} onChange={e=>{setCand(e.target.value);setOpp('')}} required><option value="">Select a model</option>{data.models.map(m=><option key={m.registry+m.id} value={m.id}>{m.experiment} · {short(m.id)}</option>)}</select></label>
      <label>Opponent model<select required value={opp} onChange={e=>setOpp(e.target.value)}><option value="">Select matching board size and rules</option>{peers.map(m=><option key={m.registry+m.id} value={m.id}>{m.experiment} · {short(m.id)}{m.champion?' · Champion':''}</option>)}</select></label></>}
      <label>Device<select value={cfg.device} onChange={e=>setCfg({...cfg,device:e.target.value,amp:false,learner_gpus:1})}><option value="cpu">CPU</option><option value="cuda">CUDA</option><option value="mps">Apple MPS</option></select></label>
      {train?<label>Additional rounds<input required value={rounds} type="number" min={1} max={10000} onChange={e=>setRounds(+e.target.value)}/></label>:input('pairs')}
      </div><details><summary>{train?'Training and search settings':'Match settings'}</summary><div className="fields">
      {(train?Object.keys(numeric) as Numeric[]:['sims','seed','c_puct','max_moves','arena_workers'] as Numeric[]).map(input)}
      {train&&<><label>Self-play search<select value={cfg.selfplay_search} onChange={e=>setCfg({...cfg,selfplay_search:e.target.value})}><option value="puct">PUCT</option><option value="gumbel_root">Gumbel root search</option></select></label>
      <label>Sampling mode<select value={cfg.sampler} onChange={e=>setCfg({...cfg,sampler:e.target.value})}><option value="local">Local parallel games</option><option value="actors">External actor leases</option></select></label>
      {cfg.sampler==='actors'&&<p className="muted full">After starting the job, run the actor command with the same data directory and job ID.</p>}
      {cfg.device==='cuda'&&<label>Training GPU count<input type="number" min={1} max={64} value={cfg.learner_gpus} onChange={e=>setCfg({...cfg,learner_gpus:+e.target.value})}/></label>}</>}
      {train&&cfg.device==='cuda'&&<label>Precision<select value={cfg.amp?'bf16':'fp32'} onChange={e=>setCfg({...cfg,amp:e.target.value==='bf16'})}><option value="fp32">FP32</option><option value="bf16">BF16</option></select></label>}</div></details>
      {!train&&peers.length===0&&<p className="muted">Choose two frozen models with matching board size and rules. They may come from different experiments.</p>}
      <button className="primary" disabled={busy||running||(!train&&(!cand||!opp))}>{train?'Start training':'Start paired match'}</button>
    </form>{error&&<p role="alert" className="error">{error}</p>}</article>
    {detailError&&<p role="alert" className="error">{detailError}</p>}
    {d&&<section className="card"><header className="card-head"><div><p className="overline">{short(d.id)}</p><h3>{d.config.experiment} · {statuses[d.state]}</h3></div></header>
      <div className="metrics"><div><b>{phases[d.phase]||d.phase}</b><small>Phase</small></div><div><b>{d.step}</b><small>Update steps</small></div><div><b>{d.epoch}</b><small>Completed rounds</small></div></div>
      {active(d)&&<p>{d.stop_requested?'Stopping gracefully':phases[d.phase]} · {d.done} / {d.total}</p>}{d.error&&<p className="error">{d.error}</p>}
      <div className="buttons">{active(d)&&<button disabled={busy||d.stop_requested} onClick={()=>action(()=>api('jobs/'+d.id+'/stop',{}))}>Stop job</button>}
      {train&&d.checkpoint&&!active(d)&&<button disabled={running||busy||rounds<1} onClick={()=>start(d.id)}>Resume from checkpoint for {rounds} rounds</button>}</div>
      {d.source&&<p className="muted">Source checkpoint {short(d.source)}</p>}
      <Curve events={d.events}/>{d.reports.map(name=><Result key={name} name={name} job={d.id}/>)}
      {!!d.events.length&&<details><summary>Run log</summary><pre>{d.events.slice(-35).map(e=>JSON.stringify(e)).join('\n')}</pre></details>}
    </section>}</div><aside className="card history"><h3>Job history</h3>{!rows.length?<p className="muted">No jobs yet</p>:rows.map(r=><button key={r.id} className={'job '+(r.id===chosen?'selected':'')} onClick={()=>choose(r.id)}><strong>{r.config.experiment}</strong><span>{statuses[r.state]} · {r.kind==='league'?'Historical league':r.kind==='arena'?'Independent evaluation':'Training'}</span><small>{date(r.created)} · {short(r.id)}</small></button>)}</aside></section>
}
