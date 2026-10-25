import type { CompoundAiEvaluation, CompoundAiReport, LayoutToolTrace } from "../../layout/compound/ai/workflow";
import type { LayoutMetrics } from "../../layout/compound/layout-plan";

export const qualityRows: { key: keyof LayoutMetrics; label: string; unit?: string }[] = [
  { key: "crossings", label: "Crossings" },
  { key: "labelCollisions", label: "Label collisions" },
  { key: "bends", label: "Bends" },
  { key: "sharedLength", label: "Overlapping route length", unit: "px" },
  { key: "length", label: "Route length", unit: "px" },
  { key: "area", label: "Content area", unit: "px²" },
];
export function AiRunComparison({ report }: { report: CompoundAiReport }) {
  return (
    <table className="layout-rules" aria-label="AI layout before and after">
      <thead>
        <tr>
          <th scope="col">Metric</th>
          <th scope="col">Before</th>
          <th scope="col">Selected</th>
          <th scope="col">Change</th>
        </tr>
      </thead>
      <tbody>
        {qualityRows.map(({ key, label, unit }) => {
          const before = Math.round(report.before[key]),
            after = Math.round(report.after[key]),
            delta = after - before;
          return (
            <tr key={key}>
              <th scope="row">
                {label}
                {unit ? ` (${unit})` : ""}
              </th>
              <td>{before}</td>
              <td>{after}</td>
              <td>
                {delta > 0 ? "+" : ""}
                {delta}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
export default function AiRunResult({
  report,
  current,
  evaluations,
  tools = [],
}: {
  report: CompoundAiReport | null;
  current: boolean;
  evaluations: CompoundAiEvaluation[];
  tools?: LayoutToolTrace[];
}) {
  if (!report && !evaluations.length && !tools.length) return null;
  return (
    <section className="layout-ai-result" aria-label="AI run result">
      <h3>{report ? "Last AI run" : "AI layout activity"}</h3>
      {report && (
        <>
          <p>
            <strong>
              {report.candidateId === "current"
                ? "Kept current layout"
                : report.changed
                  ? "Layout changed"
                  : "Geometry unchanged"}
            </strong>{" "}
            · {report.evaluations} evaluations · {report.decisions} tool calls · selected {report.candidateId}
          </p>
          <p>
            {report.after.movedNodes} nodes/groups changed · {report.after.changedEdges} routes changed
          </p>
          <p>{report.summary}</p>
          <p>Structure-only review</p>
          {report.design && <p>{report.design.purpose}</p>}
          <details>
            <summary>Design review</summary>
            <p>{report.review.readingFlow}</p>
            <p>{report.review.hierarchy}</p>
            <p>{report.review.relationships}</p>
            {report.review.tradeoffs.map((text, i) => (
              <p key={i}>{text}</p>
            ))}
          </details>
          <p>
            {report.requests}/{report.requestLimit} requests · {(report.elapsedMs / 1000).toFixed(1)} s ·{" "}
            {report.stopReason}
          </p>
          <details>
            <summary>Token usage</summary>
            <p>Provider-reported tokens; reasoning may be included in output. Missing values are unavailable.</p>
            <ul>
              {Array.from({ length: report.requests }, (_, i) => {
                const usage = report.usage[i];
                return (
                  <li key={i}>
                    Request {i + 1}: input {usage?.inputTokens ?? "unavailable"} · output{" "}
                    {usage?.outputTokens ?? "unavailable"} · reasoning {usage?.reasoningTokens ?? "unavailable"}
                  </li>
                );
              })}
            </ul>
          </details>
          {!report.evaluations && <p>No alternative layout was evaluated.</p>}
          {!current && <p>This result is from an earlier layout context; the current canvas has changed.</p>}
          {!current && <AiRunComparison report={report} />}
        </>
      )}
      {!!tools.length && (
        <details>
          <summary>Tool calls ({tools.length})</summary>
          <ol>
            {tools.map((tool, i) => (
              <li key={i}>
                <strong>
                  {tool.name} · {tool.ok ? "completed" : "error"}
                </strong>
                <details>
                  <summary>Input and result</summary>
                  <pre>{tool.arguments}</pre>
                  <pre>{JSON.stringify(tool.result, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ol>
        </details>
      )}
      {!!evaluations.length && (
        <details>
          <summary>Evaluation history ({evaluations.length})</summary>
          <ol>
            {evaluations.map((trial, index) => (
              <li key={index}>
                <strong>
                  {trial.candidateId} · {trial.status}
                  {` · revision ${trial.revision}`}
                  {report?.candidateId === trial.candidateId ? " · selected" : ""}
                </strong>
                <p>{trial.hypothesis}</p>
                {!!trial.reroutedEdgeIds?.length && (
                  <p>{trial.reroutedEdgeIds.length} connections routed by the geometry engine</p>
                )}
                {trial.metrics && (
                  <p>
                    {trial.metrics.crossings} crossings · {trial.metrics.bends} bends ·{" "}
                    {Math.round(trial.metrics.length)} px route length · {trial.metrics.movedNodes} nodes/groups changed
                    · {trial.metrics.changedEdges} routes changed
                  </p>
                )}
                {trial.error && <p>{trial.error}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
