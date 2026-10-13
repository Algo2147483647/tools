import { EXAMPLE_WORKSPACES } from "../../workspace/examples";

export default function ExampleGallery({ onOpen, busy }: { onOpen: (id: string) => void; busy: boolean }) {
  return (
    <section className="example-gallery" aria-labelledby="example-title">
      <div className="welcome-section-heading">
        <h2 id="example-title">Explore a workspace</h2>
        <span>A few places to begin</span>
      </div>
      <div className="example-grid">
        {EXAMPLE_WORKSPACES.map((example) => (
          <button
            key={example.id}
            className={`example-card example-card--${example.id}`}
            onClick={() => onOpen(example.id)}
            disabled={busy}
            aria-label={`Open ${example.title} workspace`}
          >
            <ExampleArt kind={example.id} color={example.accent} />
            <span className="example-card-body">
              <span className="eyebrow">{example.kind}</span>
              <strong>
                {example.title}
                <span aria-hidden="true">↗</span>
              </strong>
              <span className="example-description">{example.description}</span>
              <span className="example-detail">{example.detail}</span>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function ExampleArt({ kind, color }: { kind: string; color: string }) {
  return (
    <svg className="example-art" viewBox="0 0 320 132" fill="none" aria-hidden="true">
      <defs>
        <pattern id={`dots-${kind}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r=".65" fill={color} opacity=".18" />
        </pattern>
      </defs>
      <rect width="320" height="132" fill={`url(#dots-${kind})`} />
      {kind === "commerce" ? (
        <g stroke={color}>
          <rect x="22" y="16" width="200" height="100" rx="9" fill="white" fillOpacity=".7" strokeOpacity=".5" />
          <text x="34" y="34" fill={color} stroke="none" fontSize="11">
            Commerce
          </text>
          <rect x="34" y="45" width="115" height="59" rx="7" fill={color} fillOpacity=".06" strokeOpacity=".4" />
          <text x="45" y="62" fill={color} stroke="none" fontSize="10">
            Payments
          </text>
          <rect x="45" y="73" width="43" height="20" rx="5" fill="white" />
          <rect x="99" y="73" width="37" height="20" rx="5" fill="white" />
          <rect x="165" y="71" width="43" height="24" rx="5" fill="white" />
          <path d="M88 83H99M136 83H165M208 83H243V59H260" />
          <rect x="260" y="44" width="38" height="30" rx="6" fill="white" />
          <circle cx="279" cy="59" r="4" fill={color} />
        </g>
      ) : kind === "mathematics" ? (
        <>
          <g stroke={color} opacity=".4">
            <path d="M73 66H110C130 66 120 28 146 28H180M110 66H146M110 66C130 66 120 104 146 104H180M208 28C236 28 226 47 251 47M208 104C236 104 226 85 251 85" />
          </g>
          {[
            [30, 52, 74, 28, "Set"],
            [146, 16, 69, 25, "Algebra"],
            [146, 54, 69, 25, "Analysis"],
            [146, 92, 69, 25, "Geometry"],
            [246, 35, 44, 24, "Field"],
            [246, 73, 44, 24, "Space"],
          ].map(([x, y, w, h, label]) => (
            <g key={label}>
              <rect x={x} y={y} width={w} height={h} rx="6" fill="white" stroke={color} strokeOpacity=".4" />
              <text
                x={Number(x) + Number(w) / 2}
                y={Number(y) + Number(h) / 2 + 4}
                textAnchor="middle"
                fill={color}
                fontFamily="Georgia, serif"
                fontSize="11"
              >
                {label}
              </text>
            </g>
          ))}
        </>
      ) : kind === "space-history" ? (
        <>
          <g stroke={color} strokeWidth="1" opacity=".2">
            <path d="M25 27H296M25 65H296M25 103H296" />
          </g>
          <g stroke={color} strokeWidth="2.5" strokeLinecap="round">
            <path d="M92 15V118M92 42C92 53 169 47 169 65V100M169 88C169 103 92 94 92 110" />
            <path d="M239 24V109" stroke="#8c9b81" />
          </g>
          <path d="M169 65V83" stroke={color} strokeWidth="9" strokeLinecap="round" opacity=".7" />
          <path d="M239 43V81" stroke="#8c9b81" strokeWidth="9" strokeLinecap="round" opacity=".7" />
          {[
            [92, 27],
            [92, 42],
            [92, 110],
            [169, 65],
            [169, 88],
            [239, 24],
            [239, 103],
          ].map(([x, y], i) => (
            <circle key={i} cx={x} cy={y} r="4" fill="white" stroke={x === 239 ? "#8c9b81" : color} strokeWidth="2" />
          ))}
          <g fill={color} fontSize="9" fontFamily="sans-serif" opacity=".75">
            <text x="27" y="25">
              1957
            </text>
            <text x="27" y="63">
              1969
            </text>
            <text x="27" y="101">
              2025
            </text>
            <text x="106" y="25">
              Earth
            </text>
            <text x="181" y="68">
              Moon
            </text>
            <text x="251" y="45">
              Beyond
            </text>
          </g>
        </>
      ) : (
        <>
          <g strokeLinecap="butt" opacity=".25">
            <path d="M43 34C94 34 107 46 153 46S220 26 275 26" stroke={color} strokeWidth="23" />
            <path d="M43 93C100 93 105 60 153 60S220 61 275 61" stroke={color} strokeWidth="14" />
            <path
              d="M43 103C104 103 105 93 153 93S220 103 275 103"
              stroke={kind === "factorio" ? "#8d9980" : "#789bc2"}
              strokeWidth="17"
            />
            <path d="M153 48C206 48 215 91 275 91" stroke={color} strokeWidth="8" />
          </g>
          <g fill={color}>
            {[
              [36, 22, 24],
              [36, 85, 27],
              [150, 34, 38],
              [150, 83, 20],
              [274, 14, 24],
              [274, 53, 16],
              [274, 85, 26],
            ].map(([x, y, h], i) => (
              <rect key={i} x={x} y={y} width="7" height={h} rx="2" />
            ))}
          </g>
        </>
      )}
    </svg>
  );
}
