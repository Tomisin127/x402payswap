import { NextResponse } from "next/server"

/**
 * GET /api/facilitator/supported
 * ------------------------------
 * Declares what (scheme, network) combinations this facilitator knows how to
 * verify + settle. x402 clients can hit this to decide whether to route
 * payment requirements through us.
 */
export async function GET() {
  return NextResponse.json({
    kinds: [
      {
        x402Version: 1,
        scheme: "exact",
        network: "base",
      },
    ],
  })
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
