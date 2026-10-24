import type { ReactNode } from "react";
export interface LayoutRule {
  label: string;
  value: ReactNode;
}
export default function LayoutRules({ label = "Layout rules", rows }: { label?: string; rows: readonly LayoutRule[] }) {
  return (
    <table className="layout-rules" aria-label={label}>
      <thead>
        <tr>
          <th scope="col">Rule</th>
          <th scope="col">Value</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.label}>
            <th scope="row">{row.label}</th>
            <td>{row.value}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
