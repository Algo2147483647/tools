import { EXAMPLE_WORKSPACES } from "../../workspace/examples";

export default function ExampleGallery({ onOpen, busy }: { onOpen: (id: string) => void; busy: boolean }) {
  return <section className="example-gallery" aria-labelledby="example-title">
    <div className="welcome-section-heading"><h2 id="example-title">Explore a workspace</h2><span>A few places to begin</span></div>
    <div className="example-grid">{EXAMPLE_WORKSPACES.map(example => <button key={example.id} className={`example-card example-card--${example.id}`} onClick={() => onOpen(example.id)} disabled={busy} aria-label={`Open ${example.title} workspace`}>
      <ExampleArt kind={example.id} color={example.accent}/>
      <span className="example-card-body"><span className="eyebrow">{example.kind}</span><strong>{example.title}<span aria-hidden="true">↗</span></strong><span className="example-description">{example.description}</span><span className="example-detail">{example.detail}</span></span>
    </button>)}</div>
    <p className="example-gallery-note">Each example opens as a separate workspace. Edit freely and save your own copy.</p>
  </section>;
}

function ExampleArt({ kind, color }: { kind: string; color: string }) {
  return <svg className="example-art" viewBox="0 0 320 132" fill="none" aria-hidden="true">
    <defs><pattern id={`dots-${kind}`} width="16" height="16" patternUnits="userSpaceOnUse"><circle cx="8" cy="8" r=".65" fill={color} opacity=".18"/></pattern></defs>
    <rect width="320" height="132" fill={`url(#dots-${kind})`}/>
    {kind === "mathematics" ? <>
      <g stroke={color} opacity=".4"><path d="M73 66H110C130 66 120 28 146 28H180M110 66H146M110 66C130 66 120 104 146 104H180M208 28C236 28 226 47 251 47M208 104C236 104 226 85 251 85"/></g>
      {[[30,52,74,28,"Set"],[146,16,69,25,"Algebra"],[146,54,69,25,"Analysis"],[146,92,69,25,"Geometry"],[246,35,44,24,"Field"],[246,73,44,24,"Space"]].map(([x,y,w,h,label])=><g key={label}><rect x={x} y={y} width={w} height={h} rx="6" fill="white" stroke={color} strokeOpacity=".4"/><text x={Number(x)+Number(w)/2} y={Number(y)+Number(h)/2+4} textAnchor="middle" fill={color} fontFamily="Georgia, serif" fontSize="11">{label}</text></g>)}
    </> : <>
      <g strokeLinecap="butt" opacity=".25">
        <path d="M43 34C94 34 107 46 153 46S220 26 275 26" stroke={color} strokeWidth="23"/>
        <path d="M43 93C100 93 105 60 153 60S220 61 275 61" stroke={color} strokeWidth="14"/>
        <path d="M43 103C104 103 105 93 153 93S220 103 275 103" stroke={kind==="factorio"?"#8d9980":"#789bc2"} strokeWidth="17"/>
        <path d="M153 48C206 48 215 91 275 91" stroke={color} strokeWidth="8"/>
      </g>
      <g fill={color}>{[[36,22,24],[36,85,27],[150,34,38],[150,83,20],[274,14,24],[274,53,16],[274,85,26]].map(([x,y,h],i)=><rect key={i} x={x} y={y} width="7" height={h} rx="2"/>)}</g>
    </>}
  </svg>;
}
