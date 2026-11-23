import { useState, useEffect } from 'react'
import { api, short, type Model, type Position } from './types'

const columns = 'ABCDEFGHJKLMNOPQRSTUVWXYZ'
export function BoardPanel({models}:{models:Model[]}) {
  const [g,setGame] = useState<Position|null>(null)
  const [size,setSize] = useState(9), [human,setHuman] = useState(1), [model,setModel] = useState('')
  const [sims,setSims] = useState(8), [busy,setBusy] = useState(false), [error,setError] = useState('')
  useEffect(()=>{const key=sessionStorage.getItem('zero-game'); let alive=true
    if(key) api<Position>('games/'+key).then(v=>{if(alive){setGame(v); setSize(v.size); setHuman(v.human); setModel(v.model||'')}})
      .catch(()=>{sessionStorage.removeItem('zero-game')})
    return ()=>{alive=false}
  },[])
  const n=g?.size??size, grid=g?.grid??Array(n*n).fill(0)
  async function act(request:()=>Promise<Position>) {
    if(busy) return
    setBusy(true); setError('')
    try { const p=await request(); setGame(p); sessionStorage.setItem('zero-game',p.id) }
    catch(e){setError(String((e as Error).message))}
    finally{setBusy(false)}
  }
  const fresh=()=>api<Position>('games',{size,human,model:model||null,sims})
  const op=(path:string,data:unknown={})=>api<Position>('games/'+g!.id+'/'+path,data)
  const live=!!g && g.ply===g.moves && !g.done
  const stars=n===9?[2,4,6]:[3,9,15]
  const max=Math.max(1,...(g?.analysis?.visits??[]))
  const caption=busy?'Thinking…':!g?'Ready to play':g.done?(g.margin!>0?'Black wins by ':'White wins by ')+Math.abs(g.margin!)+' points':g.ply!==g.moves?'Reviewing game':g.turn===1?'Black to play':'White to play'
  return <section className="columns">
    <article className="card board-card"><header className="card-head"><div><p className="overline">PLAY</p><h2>Play against a model</h2></div><span className="status">{caption}</span></header>
      <div className="board-wrap"><div className="goban" style={{'--n':n} as React.CSSProperties}>
        <div className="axis top">{Array.from(columns.slice(0,n),c=><span key={c}>{c}</span>)}</div>
        <div className="axis left">{Array.from({length:n},(_,i)=><span key={i}>{n-i}</span>)}</div>
        <div className="points">{grid.map((stone,i)=>{
          const row=Math.floor(i/n),col=i%n,vis=g?.analysis?.visits[i]??0
          return <button key={i} className={'point '+(row===0?'north ':row===n-1?'south ':'')+(col===0?'west ':col===n-1?'east ':'')}
            title={columns[col]+(n-row)+(vis?' · '+vis+' visits':'')} aria-label={columns[col]+(n-row)}
            disabled={busy||!live||g?.turn!==g?.human||!g?.legal[i]}
            onClick={()=>act(()=>op('move',{action:i}))}>
            {stars.includes(row)&&stars.includes(col)&&(n!==9||row===col||row+col===8)?<i className="star"/>:null}
            {stone?<i className={'stone s'+stone+(i===g?.last?' last':'')}/>:vis>0?<i className="heat" style={{opacity:0.2+0.75*vis/max}}/>:null}
          </button>
        })}</div>
      </div></div>
      <footer className="board-foot"><span>Move <b>{g?.ply??0}</b> </span><span>{n} lines · White komi 7.5 points</span></footer>
      {g&&<div className="replay"><label htmlFor="replay">Review moves</label><input id="replay" type="range" min={0} max={g.moves} value={g.ply} disabled={busy||!g.moves}
        onChange={e=>act(()=>api<Position>('games/'+g.id+'?ply='+e.target.value))}/><span>{g.ply} / {g.moves}</span></div>}
    </article>
    <aside className="side"><section className="card"><h3>Game settings</h3><div className="fields">
      <label>Board<select value={size} onChange={e=>{setSize(+e.target.value);setModel('')}}><option value="9">9 × 9</option><option value="19">19 × 19</option></select></label>
      <label>Your color<select value={human} onChange={e=>setHuman(+e.target.value)}><option value="1">Black · plays first</option><option value="-1">White · plays second</option></select></label>
      <label className="full">Opponent model<select value={model} onChange={e=>setModel(e.target.value)}><option value="">Random initial network</option>{models.filter(m=>m.net.size===size).map(m=><option key={m.registry+m.id} value={m.id}>{m.experiment} · {short(m.id)}{m.champion?' · Champion':''}</option>)}</select></label>
      <label className="full">New simulations per move<input type="number" min={1} max={4096} value={sims} onChange={e=>setSims(+e.target.value)}/></label></div>
      <button className="primary wide" disabled={busy||sims<1||sims>4096} onClick={()=>act(fresh)}>{g?'Start a new game':'Start game'}</button>
    </section><section className="card"><h3>Current game</h3>
      <dl><dt>Models</dt><dd>{g?(g.model?short(g.model):'Random initial network'):'—'}</dd><dt>Consecutive passes</dt><dd>{g?.passes??'—'}</dd>
      <dt>Search value for side to move</dt><dd>{g?.analysis?.value.toFixed(3)??'—'}</dd></dl>
      <div className="buttons"><button disabled={busy||!live} onClick={()=>act(()=>op('move',{action:n*n}))}>Pass</button>
      <button disabled={busy||!g||g.ply!==g.moves||g.moves<(g.human===1?1:2)} onClick={()=>act(()=>op('undo'))}>Undo</button>
      <button disabled={busy||!live} onClick={()=>act(()=>op('analyse'))}>Analyze moves</button>
      {g&&<a className="button" href={'/api/games/'+g.id+'/sgf'} download>Export SGF</a>}</div>
      {g?.analysis&&<p className="muted">Green markers show visit counts. Pass received {g.analysis.visits[n*n]} visits.</p>}
    </section>{error&&<div role="alert" className="error">{error}</div>}</aside>
  </section>
}
