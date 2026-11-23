import { useEffect, useState } from 'react'
import { active, api, date, pct, phases, short, statuses, type Config, type Detail, type Job, type Log, type Overview, type Report } from './types'

const numeric = {seed:'随机种子',sims:'每手模拟',games:'每轮自弈盘数',lanes:'并行对局',steps:'每轮更新上限',batch:'训练批次',
  pairs:'评估开局对数',window:'回放窗口（局面）',lr:'学习率',reuse_limit:'样本复用上限',warmup:'预热步数',decay_steps:'衰减步数',
  c_puct:'探索常数',max_moves:'步数上限（0 为自动）',wall_minutes:'用时预算（分钟，0 为不限）',arena_workers:'并行评估进程数'}
type Numeric=keyof typeof numeric
function Curve({events}:{events:Log[]}) {
  const rows=events.filter(e=>e.event==='update'&&e.loss!==undefined)
  if(rows.length<2)return null
  const ys=rows.map(r=>r.loss!),low=Math.min(...ys),high=Math.max(...ys)
  const points=ys.map((v,i)=>[5+i*410/(ys.length-1),75-(v-low)*65/(high-low||1)].join(',')).join(' ')
  return <figure><figcaption>训练损失 <strong>{ys.at(-1)!.toFixed(3)}</strong></figcaption>
    <svg viewBox="0 0 420 84" role="img" aria-label={'训练损失从 '+ys[0].toFixed(3)+' 到 '+ys.at(-1)!.toFixed(3)}><path d="M5 75H415" stroke="#ccd6cc"/><polyline points={points} fill="none" stroke="#167361" strokeWidth="2.5"/></svg>
    <small>训练步 {rows[0].step} – {rows.at(-1)!.step}</small></figure>
}
function Result({job,name}:{job:string;name:string}){
  const [report,setReport]=useState<Report|null>(null),[err,setErr]=useState('')
  const path='jobs/'+job+'/reports/'+name
  useEffect(()=>{let live=true;setReport(null);setErr('');api<Report>(path).then(r=>{if(live)setReport(r)}).catch(e=>{if(live)setErr(String(e))});return()=>{live=false}},[path])
  if(!report)return <p>{err||'正在读取报告…'}</p>
  return <div className="result"><div className="section-line"><h4>{report.kind==='league'?'历史联赛 · '+short(report.candidate)+' / '+short(report.incumbent):name==='report-independent'?'独立比赛':'第 '+(Number(name.slice(7))+1)+' 轮比赛'}</h4><a href={'/api/'+path} download={name+'.json'}>导出 JSON</a></div>
    <div className="metrics"><div><b>{report.wins} / {report.losses}</b><small>候选胜 / 负</small></div><div><b>{pct(report.paired_score)}</b><small>成对得分率</small></div><div><b>{pct(report.lower95)}</b><small>95% 单侧下界</small></div></div>
    <p className="muted">完整开局对 {report.complete_pairs} / {report.planned_pairs} · 未终局 {report.unfinished} · {report.kind==='league'?'多对手校正下界 '+pct(report.family_lower95??null):name==='report-independent'?'独立评估':report.published?'候选已晋级':report.eligible?'冠军版本已变化':'未晋级'}</p></div>
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
    <header className="card-head"><div><p className="overline">{train?'LEARNING':'ARENA'}</p><h2>{train?'自主训练':'评估竞技场'}</h2></div><span className="status">{running?'计算任务运行中':'计算队列空闲'}</span></header>
    <form onSubmit={e=>{e.preventDefault();void start()}}><div className="fields">
    {train?<><label>训练预设<select value={preset} onChange={e=>{setPreset(e.target.value);setCfg({...data.presets[e.target.value]})}}>{Object.keys(data.presets).map(k=><option key={k}>{k}</option>)}</select></label>
      <label>实验名称<input required pattern="[a-zA-Z0-9][a-zA-Z0-9_\-]{0,47}" value={cfg.experiment} onChange={e=>setCfg({...cfg,experiment:e.target.value})}/></label></>:
      <><label>候选模型<select value={cand} onChange={e=>{setCand(e.target.value);setOpp('')}} required><option value="">选择模型</option>{data.models.map(m=><option key={m.registry+m.id} value={m.id}>{m.experiment} · {short(m.id)}</option>)}</select></label>
      <label>对照模型<select required value={opp} onChange={e=>setOpp(e.target.value)}><option value="">选择相同尺寸和规则的模型</option>{peers.map(m=><option key={m.registry+m.id} value={m.id}>{m.experiment} · {short(m.id)}{m.champion?' · 冠军':''}</option>)}</select></label></>}
      <label>计算设备<select value={cfg.device} onChange={e=>setCfg({...cfg,device:e.target.value,amp:false,learner_gpus:1})}><option value="cpu">CPU</option><option value="cuda">CUDA</option><option value="mps">Apple MPS</option></select></label>
      {train?<label>新增轮数<input required value={rounds} type="number" min={1} max={10000} onChange={e=>setRounds(+e.target.value)}/></label>:input('pairs')}
      </div><details><summary>{train?'训练与搜索参数':'比赛参数'}</summary><div className="fields">
      {(train?Object.keys(numeric) as Numeric[]:['sims','seed','c_puct','max_moves','arena_workers'] as Numeric[]).map(input)}
      {train&&<><label>自弈搜索<select value={cfg.selfplay_search} onChange={e=>setCfg({...cfg,selfplay_search:e.target.value})}><option value="puct">PUCT</option><option value="gumbel_root">Gumbel 根搜索</option></select></label>
      <label>采样方式<select value={cfg.sampler} onChange={e=>setCfg({...cfg,sampler:e.target.value})}><option value="local">本机多盘</option><option value="actors">外部 actor 租约</option></select></label>
      {cfg.sampler==='actors'&&<p className="muted full">启动任务后，使用命令行 actor 连接同一个数据目录和任务编号。</p>}
      {cfg.device==='cuda'&&<label>训练 GPU 数<input type="number" min={1} max={64} value={cfg.learner_gpus} onChange={e=>setCfg({...cfg,learner_gpus:+e.target.value})}/></label>}</>}
      {train&&cfg.device==='cuda'&&<label>计算精度<select value={cfg.amp?'bf16':'fp32'} onChange={e=>setCfg({...cfg,amp:e.target.value==='bf16'})}><option value="fp32">FP32</option><option value="bf16">BF16</option></select></label>}</div></details>
      {!train&&peers.length===0&&<p className="muted">独立比赛需要相同棋盘尺寸和规则的两个冻结模型，支持跨实验比较。</p>}
      <button className="primary" disabled={busy||running||(!train&&(!cand||!opp))}>{train?'启动训练':'开始成对比赛'}</button>
    </form>{error&&<p role="alert" className="error">{error}</p>}</article>
    {detailError&&<p role="alert" className="error">{detailError}</p>}
    {d&&<section className="card"><header className="card-head"><div><p className="overline">{short(d.id)}</p><h3>{d.config.experiment} · {statuses[d.state]}</h3></div></header>
      <div className="metrics"><div><b>{phases[d.phase]||d.phase}</b><small>阶段</small></div><div><b>{d.step}</b><small>更新步数</small></div><div><b>{d.epoch}</b><small>完成轮数</small></div></div>
      {active(d)&&<p>{d.stop_requested?'正在有序停止':phases[d.phase]} · {d.done} / {d.total}</p>}{d.error&&<p className="error">{d.error}</p>}
      <div className="buttons">{active(d)&&<button disabled={busy||d.stop_requested} onClick={()=>action(()=>api('jobs/'+d.id+'/stop',{}))}>停止任务</button>}
      {train&&d.checkpoint&&!active(d)&&<button disabled={running||busy||rounds<1} onClick={()=>start(d.id)}>从检查点续训 {rounds} 轮</button>}</div>
      {d.source&&<p className="muted">源检查点 {short(d.source)}</p>}
      <Curve events={d.events}/>{d.reports.map(name=><Result key={name} name={name} job={d.id}/>)}
      {!!d.events.length&&<details><summary>运行日志</summary><pre>{d.events.slice(-35).map(e=>JSON.stringify(e)).join('\n')}</pre></details>}
    </section>}</div><aside className="card history"><h3>任务记录</h3>{!rows.length?<p className="muted">尚无任务记录</p>:rows.map(r=><button key={r.id} className={'job '+(r.id===chosen?'selected':'')} onClick={()=>choose(r.id)}><strong>{r.config.experiment}</strong><span>{statuses[r.state]} · {r.kind==='league'?'历史联赛':r.kind==='arena'?'独立评估':'训练'}</span><small>{date(r.created)} · {short(r.id)}</small></button>)}</aside></section>
}
