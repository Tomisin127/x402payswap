import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Protected Premium Route
 * -----------------------
 * Reached ONLY after the x402 middleware has verified + settled a 0.01 USDC payment
 * on Base mainnet. Adds a secondary replay-protection check backed by Upstash
 * Redis: each unique X-PAYMENT payload is hashed and stored for 24h, so even if
 * a payload somehow bypassed facilitator nonce checks it cannot be reused here.
 */
export async function GET(request: Request) {
  const paymentHeader = request.headers.get("x-payment")

  if (paymentHeader) {
    const key = await sha256Hex(paymentHeader)
    const firstUse = await recordPaymentOnce(key)
    if (!firstUse) {
      return NextResponse.json(
        {
          error: "Replay detected",
          message: "This payment proof was already used. Please submit a new payment.",
        },
        { status: 409 },
      )
    }
  }

  // Premium payload — anything gated behind payment goes here.
  const premiumData = {
    unlockedAt: new Date().toISOString(),
    accessToken: crypto.randomUUID(),
    items: [
      {
        id: "alpha-001",
        title: "On-chain yield snapshot",
        body: "Top 3 Base-native USDC yield venues this week, ranked by net APY after fees.",
        score: 94.2,
      },
      {
        id: "alpha-002",
        title: "Mempool anomaly report",
        body: "Unusual coordinated flow across 4 Base addresses in the last 6 hours.",
        score: 87.5,
      },
      {
        id: "alpha-003",
        title: "Agent trade log",
        body: "Signed trade intents from the demo research agent, ready to replay.",
        score: 91.8,
      },
    ],
    note: "This response is only ever returned after a verified 0.01 USDC payment on Base.",
  }

  const response = NextResponse.json(premiumData)

  // Forward the facilitator's settlement receipt to the client (if present).
  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) {
    response.headers.set("x-payment-response", settlementResponse)
  }

  return response
}
