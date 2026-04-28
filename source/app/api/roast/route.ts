import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.01
 * Returns a gentle, PG-rated roast. Requires ?name= query param.
 */

const TEMPLATES = [
  "{name} types gm with such conviction you'd think they were announcing a merger.",
  "{name}'s portfolio has more tabs open than convictions.",
  "If {name} were a block, they'd be 51% uncle.",
  "{name} reads the whitepaper like it's a horoscope.",
  "{name} once approved infinite allowance to a contract named 'trust me bro'.",
  "{name} treats slippage tolerance as a personality trait.",
  "The only thing {name} has verified on Etherscan is their own vibes.",
  "{name} once explained zk-proofs by closing their eyes and whispering 'it just works'.",
  "{name} thinks 'revoke' is a type of jacket.",
  "{name} bridges assets the way other people lose umbrellas.",
]

function sanitize(input: string): string {
  // Strip control chars, trim, cap length, allow letters/numbers/space/basic punctuation.
  const trimmed = input.trim().slice(0, 40)
  return trimmed.replace(/[^\p{L}\p{N}\s.'-]/gu, "")
}

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

  const url = new URL(request.url)
  const rawName = url.searchParams.get("name") ?? ""
  const name = sanitize(rawName)

  if (!name) {
    return NextResponse.json(
      {
        error: "Missing name",
        message: "Pass ?name=Alice. We roast respectfully but we need a target.",
      },
      { status: 400 },
    )
  }

  const roast = pick(TEMPLATES).replace(/\{name\}/g, name)

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    subject: name,
    roast,
    disclaimer: "Good-natured. No hard feelings. Tip {name} onchain to make it up.",
    note: "Settled on Base for 0.01 USDC.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
