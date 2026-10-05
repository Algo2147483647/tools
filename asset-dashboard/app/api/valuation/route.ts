import { NextResponse } from "next/server";
import { validatePortfolioConfig } from "@/lib/valuation/schema";
import { ValuationError } from "@/lib/valuation/types";
import { valuePortfolio } from "@/lib/valuation/valuation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 256 * 1024;

async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) {
    throw new ValuationError("Portfolio JSON must be smaller than 256 KiB.", 413);
  }
  if (!request.body) throw new SyntaxError("Empty request body.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new ValuationError("Portfolio JSON must be smaller than 256 KiB.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export async function POST(request: Request) {
  try {
    const body = await readBody(request);
    const config = validatePortfolioConfig(body);
    const displayBase = (body as Record<string, unknown>).displayBase;
    if (displayBase !== undefined && typeof displayBase !== "string") throw new ValuationError("Display currency must be a string.");
    const result = await valuePortfolio(config, displayBase, { signal: request.signal });
    if (result.assets.length > 0 && result.pricedAssetCount === 0) {
      return NextResponse.json({ ...result, error: "No assets could be valued. Check the asset details and market data availability." }, { status: 502 });
    }
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Request body must be valid JSON."
        : error instanceof ValuationError
          ? error.message
          : "Unable to value this portfolio. Please try again.";

    return NextResponse.json(
      {
        error: message
      },
      {
        status: error instanceof SyntaxError ? 400 : error instanceof ValuationError ? error.status : 500
      }
    );
  }
}
