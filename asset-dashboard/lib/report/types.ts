export interface PortfolioPdfRow {
  name: string;
  category: string;
  quantity: string;
  allocation: string;
  value: string;
  status: string;
  source: string;
  quoteDate: string;
  notes: string;
}

export interface PortfolioPdfReport {
  name: string;
  generatedAt: string;
  displayUnit: string;
  total: string;
  shownTotal: string;
  scope: string;
  valued: string;
  currencies: string;
  attention: string;
  notice: string;
  rows: PortfolioPdfRow[];
}

export function validateReport(input: unknown): PortfolioPdfReport {
  function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error("Invalid PDF report.");
    return value as Record<string, unknown>;
  }
  function text(record: Record<string, unknown>, key: string, max = 500): string {
    const value = record[key];
    if (typeof value !== "string" || value.length > max)
      throw new Error(`Invalid PDF field: ${key}.`);
    return value.replace(/[\u0000-\u0008\u000b-\u001f]/g, "").replace(/[\u2010-\u2015]/g, "-");
  }
  const report = object(input);
  if (!Array.isArray(report.rows) || report.rows.length > 100)
    throw new Error("PDF reports support up to 100 assets.");
  return {
    name: text(report, "name"),
    generatedAt: text(report, "generatedAt", 80),
    displayUnit: text(report, "displayUnit", 30),
    total: text(report, "total", 100),
    shownTotal: text(report, "shownTotal", 100),
    scope: text(report, "scope", 2400),
    valued: text(report, "valued", 80),
    currencies: text(report, "currencies", 80),
    attention: text(report, "attention", 80),
    notice: text(report, "notice", 4000),
    rows: report.rows.map((value) => {
      const row = object(value);
      return {
        name: text(row, "name"), category: text(row, "category", 80),
        quantity: text(row, "quantity", 100), allocation: text(row, "allocation", 80),
        value: text(row, "value", 100), status: text(row, "status", 80),
        source: text(row, "source", 2000), quoteDate: text(row, "quoteDate", 100),
        notes: text(row, "notes", 4000),
      };
    }),
  };
}
