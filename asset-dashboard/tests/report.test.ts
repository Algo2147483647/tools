import assert from "node:assert/strict";
import test from "node:test";
import { validateReport, type PortfolioPdfReport } from "../lib/report/types";
import { createPortfolioPdf } from "../lib/report/pdf";
import { POST } from "../app/api/export-pdf/route";

const report: PortfolioPdfReport = {
  name: "Test portfolio", generatedAt: "2026-10-12T00:00:00Z", displayUnit: "USD",
  total: "$100.00", shownTotal: "$100.00", scope: "Showing 1 of 2 assets | Category: Cash",
  valued: "1 / 2", currencies: "1", attention: "1", notice: "One asset is unavailable.",
  rows: [{ name: "Cash", category: "Cash", quantity: "100 USD", allocation: "100%", value: "$100.00", status: "Valued", source: "User configuration", quoteDate: "Not available", notes: "Cash valued at face value." }],
};

test("PDF input rejects malformed rows and excessive data", () => {
  assert.throws(() => validateReport({ ...report, rows: Array(101).fill(report.rows[0]) }));
  assert.throws(() => validateReport({ ...report, rows: [{ ...report.rows[0], value: null }] }));
  assert.throws(() => validateReport({ ...report, name: "x".repeat(501) }));
  assert.equal(validateReport({ ...report, shownTotal: "—" }).shownTotal, "-");
});

test("PDF export returns a two-page attachment with caching disabled", async () => {
  const response = await POST(new Request("http://localhost/api/export-pdf", { method: "POST", body: JSON.stringify(report) }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Content-Type"), "application/pdf");
  assert.match(response.headers.get("Content-Disposition") ?? "", /^attachment/);
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  const pdf = Buffer.from(await response.arrayBuffer());
  assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
  assert.equal((pdf.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 2);
});

test("empty PDF views remain a single page and long portfolios paginate", async () => {
  const empty = await createPortfolioPdf({ ...report, rows: [] });
  assert.equal((empty.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length, 1);
  const large = await createPortfolioPdf({ ...report, rows: Array.from({ length: 100 }, (_, i) => ({ ...report.rows[0], name: `Asset ${i + 1} with a long name that wraps across table lines`, notes: "Provider message. ".repeat(20) })) });
  assert.ok((large.toString("latin1").match(/\/Type \/Page\b/g) ?? []).length > 8);
});

test("PDF API bounds request bodies without trusting Content-Length", async () => {
  const malformed = await POST(new Request("http://localhost/api/export-pdf", { method: "POST", body: "{" }));
  assert.equal(malformed.status, 400);
  const oversized = await POST(new Request("http://localhost/api/export-pdf", { method: "POST", body: "x".repeat(512 * 1024 + 1) }));
  assert.equal(oversized.status, 413);
});
