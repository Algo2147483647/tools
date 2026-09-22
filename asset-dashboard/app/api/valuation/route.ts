import { NextResponse } from "next/server";
import { validatePortfolioConfig } from "@/lib/valuation/schema";
import { ValuationError } from "@/lib/valuation/types";
import { valuePortfolio } from "@/lib/valuation/valuation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const config = validatePortfolioConfig(body);
    const displayBase = typeof body?.displayBase === "string" ? body.displayBase : "USD";
    const result = await valuePortfolio(config, displayBase);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof SyntaxError
        ? "Request body must be valid JSON."
        : error instanceof ValuationError || error instanceof Error
          ? error.message
          : "Unable to value this portfolio.";

    return NextResponse.json(
      {
        error: message
      },
      {
        status: 400
      }
    );
  }
}
