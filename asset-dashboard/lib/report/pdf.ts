import { createRequire } from "node:module";
import path from "node:path";
import { existsSync } from "node:fs";
import type { PortfolioPdfReport } from "./types";

// PDFKit's ESM entry targets browsers; select its Node entry explicitly.
const PDFDocument = createRequire(import.meta.url)("pdfkit") as typeof import("pdfkit");
const ink = "#262626";
const muted = "#707070";

export async function createPortfolioPdf(report: PortfolioPdfReport): Promise<Buffer> {
  const fonts = path.join(process.cwd(), "assets", "fonts");
  const doc = new PDFDocument({
    size: "A4", layout: "landscape", autoFirstPage: false, bufferPages: true,
    font: path.join(fonts, "NotoSerif-Regular.ttf"),
    margins: { top: 64, bottom: 52, left: 34, right: 34 },
    info: { Title: `${report.name} - Asset valuation`, Author: "Asset Dashboard" },
  });
  const output = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  try {
    doc.registerFont("Regular", path.join(fonts, "NotoSerif-Regular.ttf"));
    doc.registerFont("Bold", path.join(fonts, "NotoSerif-Bold.ttf"));
    // Windows' serif CJK font also covers locally imported Chinese asset names.
    if (/[\u2e80-\u9fff]/u.test(JSON.stringify(report))) {
      const cjk = path.join(process.env.WINDIR || "C:\\Windows", "Fonts", "simsun.ttc");
      if (!existsSync(cjk)) throw new Error("A CJK font is required to export these asset names.");
      doc.registerFont("Regular", cjk, "SimSun");
      doc.registerFont("Bold", cjk, "SimSun");
    }
    const margin = 34;
    const width = 841.89 - margin * 2;
    const bottom = 595.28 - 52;
    let y = 64;
    let section = "Holdings";
    const widths = [27, 241, 70, 112, 78, 135, width - 663];
    const xs = widths.map((_, i) => margin + widths.slice(0, i).reduce((sum, w) => sum + w, 0));

    function text(value: string, x: number, top: number, w: number, size = 9, bold = false, color = ink, align: "left" | "right" = "left") {
      doc.font(bold ? "Bold" : "Regular").fontSize(size).fillColor(color)
        .text(value, x, top, { width: w, lineGap: 2, align });
    }
    function height(value: string, w: number, size = 9, bold = false) {
      return doc.font(bold ? "Bold" : "Regular").fontSize(size).heightOfString(value, { width: w, lineGap: 2 });
    }
    function rule(top: number, color = "#dedede", weight = .4) {
      doc.strokeColor(color).lineWidth(weight).moveTo(margin, top).lineTo(margin + width, top).stroke();
    }
    doc.on("pageAdded", () => {
      text("Asset Dashboard", margin, 24, width / 2, 13, true);
      text(section, margin + width / 2, 27, width / 2, 9, false, muted, "right");
      rule(49, ink, .6);
      y = 64;
    });
    function page() { doc.addPage(); y = 64; }
    function paragraph(value: string, size = 9, color = ink, bold = false) {
      const h = height(value, width, size, bold);
      if (y + h > bottom && y > 64) page();
      text(value, margin, y, width, size, bold, color);
      y = doc.y + 7;
    }
    function tableHeader() {
      if (y + 32 > bottom) page();
      rule(y, ink, .9);
      ["No.", "Asset", "Category", "Quantity", "Allocation", `Value / ${report.displayUnit}`, "Status"].forEach((label, i) => {
        text(label, xs[i] + 5, y + 8, widths[i] - 10, 8.2, false, muted, i >= 3 && i <= 5 ? "right" : "left");
      });
      y += 29;
      rule(y, ink, .5);
    }
    page();
    paragraph(report.name, 20, ink, true);
    paragraph(`Valuation: ${report.generatedAt}  |  Display unit: ${report.displayUnit}`, 8.5, muted);
    paragraph(`Portfolio total: ${report.total}  |  Shown assets: ${report.shownTotal}`, 12);
    paragraph(`Assets valued: ${report.valued}  |  Pricing currencies: ${report.currencies}  |  Needs attention: ${report.attention}`, 9, muted);
    paragraph(report.scope, 8.5, muted);
    if (report.notice) paragraph(report.notice, 9, "#904a3d");
    y += 4;
    tableHeader();
    if (!report.rows.length) { y += 14; paragraph("No assets match the current filters.", 10, muted); }
    report.rows.forEach((row, index) => {
      const cells = [String(index + 1), row.name, row.category, row.quantity, row.allocation, row.value, row.status];
      const rowHeight = Math.max(26, ...cells.map((value, i) => height(value, widths[i] - 10, 9, i === 1) + 12));
      if (y + rowHeight > bottom) { page(); tableHeader(); }
      cells.forEach((value, i) => {
        const color = i === 0 ? muted : i === 6 && row.status !== "Valued" ? "#904a3d" : ink;
        text(value, xs[i] + 5, y + 6, widths[i] - 10, 9, i === 1, color, i >= 3 && i <= 5 ? "right" : "left");
      });
      y += rowHeight;
      rule(y);
    });
    if (report.rows.length) {
      section = "Quote details";
      page();
      paragraph("Quote details", 18, ink, true);
      report.rows.forEach((row, index) => {
        if (y + 90 > bottom) page();
        paragraph(`${index + 1}. ${row.name}`, 10, ink, true);
        paragraph(`${row.status}  |  Quote / NAV date: ${row.quoteDate}`, 8.5, muted);
        paragraph(`Source: ${row.source}`, 8.5, muted);
        if (row.notes) paragraph(row.notes, 8.5);
        rule(y); y += 12;
      });
    }
    const pages = doc.bufferedPageRange();
    for (let i = 0; i < pages.count; i++) {
      doc.switchToPage(i);
      doc.page.margins.bottom = 0;
      rule(555);
      text("Indicative values. Unavailable assets are excluded from totals; liabilities are excluded.", margin, 563, width - 90, 7.5, false, muted);
      text(`${i + 1} / ${pages.count}`, margin + width - 80, 563, 80, 8, false, muted, "right");
    }
    doc.end();
  } catch (error) {
    doc.destroy(error instanceof Error ? error : new Error("PDF export failed."));
  }
  return output;
}
