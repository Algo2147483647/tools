import { useId, useState } from "react";
import { downloadJsonFile } from "../../adapters/download";
import { JsonSyntax } from "../NodeJsonView";
import type { SchemaField } from "./schemaModel";

export default function ProtocolSchema({
  label,
  version,
  fields,
  example,
  fileName,
}: {
  label: string;
  version: string;
  fields: SchemaField[];
  example: unknown;
  fileName: string;
}) {
  const titleId = useId();
  const [view, setView] = useState<"fields" | "example">("fields");
  const [copyStatus, setCopyStatus] = useState("");
  const json = JSON.stringify(example, null, 2);
  return (
    <section className="chart-schema" aria-labelledby={titleId}>
      <header className="chart-schema-heading">
        <div>
          <h3 id={titleId}>
            Schema <span>{label}</span>
          </h3>
          <small>{version}</small>
        </div>
        <div className="chart-schema-switch" role="group" aria-label={`${label} schema view`}>
          <button type="button" aria-pressed={view === "fields"} onClick={() => setView("fields")}>
            Fields
          </button>
          <button type="button" aria-pressed={view === "example"} onClick={() => setView("example")}>
            example.json
          </button>
        </div>
      </header>
      {view === "fields" ? (
        <div className="schema-table-scroll" role="region" aria-label={`${label} protocol fields`} tabIndex={0}>
          <table className="schema-table">
            <caption className="sr-only">
              {label} protocol; required children apply when their parent is present.
            </caption>
            <thead>
              <tr>
                <th scope="col">Field</th>
                <th scope="col">Type</th>
                <th scope="col">Required / Optional</th>
                <th scope="col">Default</th>
                <th scope="col">Description</th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field) => (
                <tr key={field.path}>
                  <th scope="row">
                    <code>{field.path}</code>
                  </th>
                  <td>
                    <code>{field.type}</code>
                  </td>
                  <td>{field.requirement}</td>
                  <td>
                    <code>{field.defaultValue ?? "—"}</code>
                  </td>
                  <td>{field.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="chart-schema-example">
          <div className="chart-schema-code-toolbar">
            <span>{fileName}</span>
            <div className="chart-schema-code-actions">
              <button type="button" onClick={() => downloadJsonFile(json, fileName)}>
                Download JSON
              </button>
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
          </div>
          <pre aria-label={`${label} JSON example`}>
            <code>
              <JsonSyntax value={json} />
            </code>
          </pre>
          <span role="status" className="chart-schema-copy-status">
            {copyStatus}
          </span>
        </div>
      )}
    </section>
  );
}
