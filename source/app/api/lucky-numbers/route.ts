import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.01
 * Six lucky numbers with a short interpretation. Seeded by the current minute
 * so two agents calling in the same minute get stable-ish answers.
 */

function mulberry32(seed: number) {
  let t = seed >>> 0
  return () => {
    t = (t + 0x6d2b79f5) >>> 0
    let r = t
    r = Math.imul(r ^ (r >>> 15), r | 1)
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61)
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

const INTERPRETATIONS = [
  "Lean into a small, reversible decision today.",
  "A dormant wallet holds something worth revisiting.",
  "Consolidate, don't chase.",
  "Say yes to the shorter meeting.",
  "The next new contact matters more than the last one.",
  "Back up something you currently only have in one place.",
  "A slow approval is still an approval.",
  "You've been underestimating a tiny compounding habit.",
]

export async function GET(request: Request) {
  const paymentHeader = request.headers.get("x-payment")
  if (paymentHeader) {
    const key = await sha256Hex(paymentHeader)
    const firstUse = await recordPaymentOnce(key)
    if (!firstUse) {
      return NextResponse.json(
        { error: "Replay detected", message: "This payment proof was already used." },
        { status: 409 },
      )
    }
  }

  const minuteSeed = Math.floor(Date.now() / 60_000)
  const rng = mulberry32(minuteSeed)

  const picked = new Set<number>()
  while (picked.size < 6) picked.add(1 + Math.floor(rng() * 49))
  const numbers = Array.from(picked).sort((a, b) => a - b)

  const interpretation = INTERPRETATIONS[Math.floor(rng() * INTERPRETATIONS.length)]

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    numbers,
    bonus: 1 + Math.floor(rng() * 12),
    interpretation,
    note: "Settled on Base for 0.01 USDC. Not financial advice.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}
