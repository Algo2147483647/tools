import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { BoardPanel } from './Board'
import { Tasks } from './Tasks'
import { api, date, short, type Overview } from './types'
import './style.css'

const tabs=['对弈','训练','模型','评估']
function App(){
  const [tab,setTab]=useState(()=>tabs.includes(location.hash.slice(1))?location.hash.slice(1):'对弈')
  const [data,setData]=useState<Overview|null>(null),[error,setError]=useState('')
  async function refresh(){try{setData(await api<Overview>('overview'));setError('')}catch(e){setError((e as Error).message)}}
  useEffect(()=>{void refresh();const timer=setInterval(refresh,3500)
    const nav=()=>{const t=decodeURIComponent(location.hash.slice(1));setTab(tabs.includes(t)?t:'对弈')}
    nav();window.addEventListener('hashchange',nav)
    return ()=>{clearInterval(timer);window.removeEventListener('hashchange',nav)}},[])
  return <><header className="mast"><div className="mast-inner"><div className="brand"><span className="mark" aria-hidden="true">●<i>○</i></span><div><b>弈零</b><small>围棋研究台</small></div></div>
    <nav aria-label="工作区">{tabs.map(t=><a key={t} href={'#'+t} aria-current={t===tab?'page':undefined}>{t}</a>)}</nav>
    <span className="local">{error?'连接中断':'本地工作台'}</span></div></header>
    <main>{error&&<div className="error" role="alert">读取工作台失败 · {error} <button onClick={refresh}>重试</button></div>}
    {tab==='对弈'?<BoardPanel models={data?.models??[]}/>:!data?<p>正在读取本地数据…</p>:tab==='模型'?<section className="card"><header className="card-head"><div><p className="overline">MODELS</p><h2>模型仓库</h2></div><span>{data.models.length} 个冻结版本</span></header>
    {!data.models.length?<div className="empty"><h3>尚无冻结模型</h3><p>启动一次训练后，这里会显示初始权重和训练候选。</p><a className="button" href="#训练">前往训练</a></div>:
    <div className="table-wrap"><table><thead><tr>{['实验 / 模型摘要','棋盘','网络','训练步','版本','冻结时间'].map(s=><th key={s}>{s}</th>)}</tr></thead><tbody>
    {data.models.map(m=><tr key={m.registry+m.id}><td><strong>{m.experiment}</strong><code title={m.id}>{short(m.id)}</code></td><td>{m.net.size} 路</td><td>{m.net.arch} · {m.net.blocks} × {m.net.width}</td><td>{m.step}</td><td>{m.origin==='random'?'随机初始':!m.gate?'冻结候选':m.gate.published?'已通过晋级':m.gate.eligible?'比较版本已过期':'未晋级'}{m.champion?' · 当前冠军':''}</td><td>{date(m.created)}</td></tr>)}
    </tbody></table></div>}</section>:<Tasks key={tab} mode={tab==='训练'?'train':'arena'} data={data} refresh={refresh}/>}</main></>
}
createRoot(document.getElementById('root')!).render(<App/>)
