import { NextResponse } from "next/server";
import { validateReport } from "@/lib/report/types";
import { createPortfolioPdf } from "@/lib/report/pdf";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const MAX_BYTES = 512 * 1024;

export async function POST(request: Request) {
  try {
    if (!request.body) return NextResponse.json({ error: "A report is required." }, { status: 400 });
    const reader = request.body.getReader();
    const chunks: Uint8Array[] = [];
    let length = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > MAX_BYTES) {
          await reader.cancel();
          return NextResponse.json({ error: "PDF data exceeds 512 KiB." }, { status: 413 });
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    let report;
    try { report = validateReport(JSON.parse(Buffer.concat(chunks).toString("utf8"))); }
    catch { return NextResponse.json({ error: "Invalid PDF report data." }, { status: 400 }); }
    const pdf = await createPortfolioPdf(report);
    return new Response(new Uint8Array(pdf), {
      headers: { "Content-Type": "application/pdf", "Content-Disposition": 'attachment; filename="asset-valuation.pdf"', "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Could not export the PDF. Please try again." }, { status: 500 });
  }
}
