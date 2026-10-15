import { EXAMPLE_WORKSPACES } from "../../workspace/examples";

export default function ExampleGallery({ onOpen, busy }: { onOpen: (id: string) => void; busy: boolean }) {
  return (
    <section className="example-gallery" aria-labelledby="example-title">
      <div className="welcome-section-heading">
        <h2 id="example-title">Explore a workspace</h2>
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

function ExampleArt({ kind, color }: { kind: (typeof EXAMPLE_WORKSPACES)[number]["id"]; color: string }) {
  return (
    <svg className="example-art" viewBox="0 0 320 132" fill="none" aria-hidden="true">
      <defs>
        <pattern id={`dots-${kind}`} width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="8" cy="8" r=".65" fill={color} opacity=".18" />
        </pattern>
      </defs>
      <rect width="320" height="132" fill={`url(#dots-${kind})`} />
      {kind === "china-history" ? (
        <>
          <g stroke={color} opacity=".13">
            <path d="M25 25H295M25 65H295M25 107H295" />
            <path d="M30 15V117" />
          </g>
          <g strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M148 24V38Q148 43 143 43H79Q74 43 74 48V65" stroke="#ad755b" />
            <path d="M148 24V65" stroke="#6b9185" />
            <path d="M148 24V38Q148 43 153 43H227Q232 43 232 48V65" stroke="#9c88a7" />
            <path d="M74 65V82Q74 87 79 87H143Q148 87 148 92V107" stroke="#ad755b" />
            <path d="M148 65V107" stroke="#6b9185" />
            <path d="M232 65V82Q232 87 227 87H153Q148 87 148 92V107" stroke="#9c88a7" />
          </g>
          {(
            [
              [148, 24, "Han", color],
              [74, 65, "Wei", "#ad755b"],
              [148, 65, "Shu", "#6b9185"],
              [232, 65, "Wu", "#9c88a7"],
              [148, 107, "Jin", color],
            ] as const
          ).map(([x, y, label, tint]) => (
            <g key={label}>
              <circle cx={x} cy={y} r="4.5" fill={tint} stroke="#fffaf3" strokeWidth="2" />
              <rect x={x + 9} y={y - 10} width="31" height="18" rx="4" fill="#f8f3eb" fillOpacity=".85" />
              <text x={x + 12} y={y + 3} fill={tint} fontSize="10" fontFamily="Georgia, serif">
                {label}
              </text>
            </g>
          ))}
        </>
      ) : kind === "commerce" ? (
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
          <g fill="none" strokeWidth="13" opacity=".35">
            <path d="M40 30C72 30 80 51 112 51" stroke="#d5854c" />
            <path d="M40 66H112" stroke="#9074bb" />
            <path d="M40 102C72 102 80 81 112 81" stroke="#7bad62" />
          </g>
          {(
            [
              [30, "Ore", "#d5854c"],
              [66, "Oil", "#9074bb"],
              [102, "Bio", "#7bad62"],
            ] as const
          ).map(([y, label, tint]) => (
            <g key={label}>
              <rect x="30" y={y - 10} width="9" height="20" rx="3" fill={tint} />
              <text x="48" y={y - 12} fill={tint} fontSize="9" fontFamily="sans-serif">
                {label}
              </text>
            </g>
          ))}
          <rect x="111" y="35" width="15" height="62" rx="4" fill="#3e948a" />
          <text x="118" y="116" fill="#3e948a" fontSize="9" textAnchor="middle">
            Production
          </text>
          <text x="237" y="18" fill="#647b77" fontSize="9" textAnchor="middle" letterSpacing="1.5">
            12 SCIENCE PACKS
          </text>
          {[
            "#dc6064",
            "#60ae6e",
            "#66768c",
            "#44aec8",
            "#a476ce",
            "#d4ac41",
            "#9ab2cd",
            "#df8a42",
            "#d078b0",
            "#9cb34c",
            "#5c8ed3",
            "#8366a4",
          ].map((tint, i) => {
            const x = 178 + (i % 6) * 23,
              y = i < 6 ? 36 : 83;
            return (
              <g key={tint}>
                <path
                  d={`M126 ${i < 6 ? 51 : 81} C147 ${i < 6 ? 51 : 81} ${x - 18} ${y + 17} ${x - 6} ${y + 17}`}
                  stroke={tint}
                  strokeWidth="2"
                  opacity=".35"
                />
                <path
                  d={`M${x - 3} ${y}V${y + 7}L${x - 7} ${y + 16}Q${x - 9} ${y + 21} ${x - 4} ${y + 21}H${x + 4}Q${x + 9} ${y + 21} ${x + 7} ${y + 16}L${x + 3} ${y + 7}V${y}Z`}
                  fill={tint}
                  fillOpacity=".87"
                  stroke={tint}
                  strokeWidth="1"
                />
                <path d={`M${x - 4} ${y}H${x + 4}`} stroke={tint} strokeWidth="2" strokeLinecap="round" />
              </g>
            );
          })}
        </>
      )}
    </svg>
  );
}
