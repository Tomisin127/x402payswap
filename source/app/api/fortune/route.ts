import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.01
 * Returns a fortune-cookie style message. Reached ONLY after the x402 middleware
 * has settled payment. Redis replay protection: each X-PAYMENT proof is single-use.
 */

const FORTUNES = [
  "A surprising opportunity will appear before block 18,000,000.",
  "The stablecoin you ignore today is the one you'll wish you held tomorrow.",
  "A gas fee once saved is a snack earned.",
  "Someone is about to ask you for a wallet address. Double-check the chain.",
  "Your mempool is quieter than you think.",
  "Today is a good day to revoke an approval.",
  "Trust the signer, verify the calldata.",
  "A small payment now is worth ten large promises later.",
  "You will soon meet a stranger who explains account abstraction badly.",
  "Fortune smiles on those who read the 402 response body.",
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

  const fortune = FORTUNES[Math.floor(Math.random() * FORTUNES.length)]

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    fortune,
    lucky: {
      color: pick(["indigo", "teal", "amber", "crimson", "onyx"]),
      hour: Math.floor(Math.random() * 24),
    },
    note: "This fortune was delivered only after a verified 0.01 USDC payment on Base.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
