import { NextResponse } from "next/server"
import { PAID_ENDPOINTS } from "@/lib/endpoints"

/**
 * Free Route — x402 Discovery Feed
 * --------------------------------
 * Machine-readable manifest of every paid endpoint this server exposes.
 * Lets bots, agents, and frontends enumerate what's available without
 * hitting each endpoint to read its 402 response individually.
 *
 * Response is cache-friendly (1 minute) — no payment required.
 */
export async function GET(request: Request) {
  const origin = new URL(request.url).origin

  const body = {
    x402Version: 1,
    network: "base",
    asset: "USDC",
    generatedAt: new Date().toISOString(),
    endpoints: PAID_ENDPOINTS.map((e) => ({
      path: e.path,
      url: `${origin}${e.path}`,
      title: e.title,
      description: e.description,
      method: e.method,
      price: e.price,
      mimeType: e.mimeType,
      maxTimeoutSeconds: e.maxTimeoutSeconds,
      params: e.params ?? [],
    })),
    docs: {
      protocol: "https://www.x402.org",
      usage:
        "Call any listed path. You'll receive HTTP 402 with payment requirements. Sign an EIP-3009 USDC transfer authorization on Base and retry with an X-PAYMENT header.",
    },
  }

  return NextResponse.json(body, {
    headers: {
      "Cache-Control": "public, max-age=60, s-maxage=60",
    },
  })
}
