import type { GraphChartType } from "../../graph/types";

export default function ChartTypeIcon({ type }: { type: GraphChartType }) {
  return (
    <svg
      className="chart-type-icon"
      viewBox="0 0 64 64"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {type === "node-link" ? (
        <>
          <path d="M18 32H25Q29 32 29 28V16Q29 12 34 12H44M29 29V48Q29 52 34 52H44" />
          <path d="m40 8 4 4-4 4m0 32 4 4-4 4" />
          <rect x="4" y="25" width="14" height="14" rx="4" fill="#eaf1fc" />
          <rect x="44" y="5" width="16" height="14" rx="4" fill="white" />
          <rect x="44" y="45" width="16" height="14" rx="4" fill="white" />
        </>
      ) : type === "compound" ? (
        <>
          <rect x="4" y="5" width="40" height="54" rx="5" fill="#eaf1fc" />
          <path d="M10 13h12" />
          <rect x="11" y="22" width="25" height="29" rx="4" fill="white" />
          <path d="M26 36H51m-4-4 4 4-4 4" />
          <rect x="17" y="31" width="10" height="10" rx="2" fill="#eaf1fc" />
          <rect x="51" y="29" width="10" height="14" rx="3" fill="white" />
        </>
      ) : type === "sankey" ? (
        <g fill="currentColor" stroke="none">
          <path d="M12 14C31 14 31 7 52 7V29C31 29 31 36 12 36Z" opacity=".25" />
          <path d="M12 36C32 36 32 46 52 46V57C32 57 32 47 12 47Z" opacity=".55" />
          <rect x="5" y="14" width="7" height="33" rx="2" />
          <rect x="52" y="7" width="7" height="22" rx="2" />
          <rect x="52" y="46" width="7" height="11" rx="2" />
        </g>
      ) : (
        <>
          <path d="M7 6V58m-3-8h6M4 32h6M4 14h6" opacity=".4" />
          <path d="M24 8V57M24 18C24 28 43 24 43 35v8c0 9-19 6-19 14" />
          <circle cx="24" cy="11" r="4" fill="white" />
          <circle cx="24" cy="55" r="4" fill="white" />
          <rect x="39" y="32" width="8" height="13" rx="4" fill="#eaf1fc" />
          <path d="M34 11h22M53 37h6M34 55h22" opacity=".5" />
        </>
      )}
    </svg>
  );
}
