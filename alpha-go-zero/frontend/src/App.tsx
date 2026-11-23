import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BoardPanel } from './Board'
import { Tasks } from './Tasks'
import { api, date, short, type Overview } from './types'
import './style.css'

const tabs=['Play','Training','Models','Evaluation']
function App(){
  const [tab,setTab]=useState(()=>tabs.includes(location.hash.slice(1))?location.hash.slice(1):'Play')
  const [data,setData]=useState<Overview|null>(null),[error,setError]=useState('')
  async function refresh(){try{setData(await api<Overview>('overview'));setError('')}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void refresh();const timer=setInterval(refresh,3500)
    const nav=()=>{const t=decodeURIComponent(location.hash.slice(1));setTab(tabs.includes(t)?t:'Play')}
    nav();window.addEventListener('hashchange',nav)
    return ()=>{clearInterval(timer);window.removeEventListener('hashchange',nav)}},[])
  return <><header className="mast"><div className="mast-inner"><div className="brand"><span className="mark" aria-hidden="true">●<i>○</i></span><div><b>WeiQi Zero</b><small>Go Workbench</small></div></div>
    <nav aria-label="Workspace">{tabs.map(t=><a key={t} href={'#'+t} aria-current={t===tab?'page':undefined}>{t}</a>)}</nav>
    <span className="local">{error?'Disconnected':'Local workbench'}</span></div></header>
    <main>{error&&<div className="error" role="alert">Could not load workbench · {error} <button onClick={refresh}>Retry</button></div>}
    {tab==='Play'?<BoardPanel models={data?.models??[]}/>:!data?<p>Loading local data…</p>:tab==='Models'?<section className="card"><header className="card-head"><div><p className="overline">MODELS</p><h2>Model registry</h2></div><span>{data.models.length} frozen versions</span></header>
    {!data.models.length?<div className="empty"><h3>No frozen models yet</h3><p>Start a training run to see initial weights and frozen candidates here.</p><a className="button" href="#Training">Open training</a></div>:
    <div className="table-wrap"><table><thead><tr>{['Experiment / Model digest','Board','Network','Training step','build','Frozen at'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>
    {data.models.map(m=><tr key={m.registry+m.id}><td><strong>{m.experiment}</strong><code title={m.id}>{short(m.id)}</code></td><td>{m.net.size} lines</td><td>{m.net.arch} · {m.net.blocks} × {m.net.width}</td><td>{m.step}</td><td>{m.origin==='random'?'Random initialization':!m.gate?'Frozen candidate':m.gate.published?'Approved':m.gate.eligible?'Stale comparison':'Not promoted'}{m.champion?' · Current champion':''}</td><td>{date(m.created)}</td></tr>)}
    </tbody></table></div>}</section>:<Tasks key={tab} mode={tab==='Training'?'train':'arena'} data={data} refresh={refresh}/>}</main></>
}
createRoot(document.getElementById('root')!).render(<App/>)
