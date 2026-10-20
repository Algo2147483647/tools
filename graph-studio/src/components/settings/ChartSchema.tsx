import { useState } from "react";
import { getGraphChartLabel, type GraphChartType } from "../../graph/types";
import { CHART_SCHEMAS } from "./chartSchemas";

export default function ChartSchema({ chartType }: { chartType: GraphChartType }) {
  const [view, setView] = useState<"fields" | "example">("fields");
  const [copyStatus, setCopyStatus] = useState("");
  const schema = CHART_SCHEMAS[chartType];
  const json = JSON.stringify(schema.example, null, 2);
  const groups = [...new Set(schema.fields.map((field) => field.group || "Document"))];
  return (
    <section className="chart-schema" aria-labelledby="chart-schema-title">
      <header className="chart-schema-heading">
        <div>
          <h3 id="chart-schema-title">
            Schema <span>{getGraphChartLabel(chartType)}</span>
          </h3>
          <small>Graph Studio · v3</small>
        </div>
        <div className="chart-schema-switch" role="group" aria-label="Schema view">
          <button type="button" aria-pressed={view === "fields"} onClick={() => setView("fields")}>
            Fields
          </button>
          <button type="button" aria-pressed={view === "example"} onClick={() => setView("example")}>
            JSON example
          </button>
        </div>
      </header>
      {view === "fields" ? (
        <div className="chart-schema-groups">
          {groups.map((group) => (
            <section key={group} className="chart-schema-field-group">
              <h4>{group}</h4>
              <dl className="chart-schema-fields">
                {schema.fields
                  .filter((field) => (field.group || "Document") === group)
                  .map((field) => (
                    <div key={field.path}>
                      <dt>
                        <code>{field.path}</code>
                        <span>{field.requirement}</span>
                      </dt>
                      <dd>
                        <code>{field.type}</code>
                        {field.defaultValue !== undefined && (
                          <div className="chart-schema-default">
                            Default: <code>{field.defaultValue}</code>
                          </div>
                        )}
                        <p>{field.description}</p>
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      ) : (
        <div className="chart-schema-example">
          <div className="chart-schema-code-toolbar">
            <span>{chartType}-example.json</span>
            <button
              type="button"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(json);
                  setCopyStatus("Copied");
                } catch {
                  setCopyStatus("Copy unavailable. Select the JSON to copy manually.");
                }
              }}
            >
              Copy JSON
            </button>
          </div>
          <pre aria-label={`${getGraphChartLabel(chartType)} JSON example`}>
            <code>{json}</code>
          </pre>
          <span role="status" className="chart-schema-copy-status">
            {copyStatus}
          </span>
        </div>
      )}
    </section>
  );
}
