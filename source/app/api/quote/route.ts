import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.001
 * Returns a short Stoic / contemplative quote with attribution.
 */

const QUOTES: Array<{ text: string; author: string }> = [
  { text: "We suffer more often in imagination than in reality.", author: "Seneca" },
  { text: "You have power over your mind — not outside events. Realize this, and you will find strength.", author: "Marcus Aurelius" },
  { text: "It is not that we have a short time to live, but that we waste a lot of it.", author: "Seneca" },
  { text: "The impediment to action advances action. What stands in the way becomes the way.", author: "Marcus Aurelius" },
  { text: "He who fears death will never do anything worthy of a living man.", author: "Seneca" },
  { text: "First say to yourself what you would be; then do what you have to do.", author: "Epictetus" },
  { text: "Waste no more time arguing what a good man should be. Be one.", author: "Marcus Aurelius" },
  { text: "Difficulties strengthen the mind, as labor does the body.", author: "Seneca" },
  { text: "It's not what happens to you, but how you react to it that matters.", author: "Epictetus" },
  { text: "Confine yourself to the present.", author: "Marcus Aurelius" },
  { text: "Luck is what happens when preparation meets opportunity.", author: "Seneca" },
  { text: "If it is not right, do not do it; if it is not true, do not say it.", author: "Marcus Aurelius" },
  { text: "No man is free who is not master of himself.", author: "Epictetus" },
  { text: "Begin at once to live, and count each separate day as a separate life.", author: "Seneca" },
  { text: "The best revenge is not to be like your enemy.", author: "Marcus Aurelius" },
]

export async function GET(request: Request) {
  const paymentHeader = request.headers.get("x-payment") || request.headers.get("x-payment-sw")
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

  const pick = QUOTES[Math.floor(Math.random() * QUOTES.length)]

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    quote: pick.text,
    author: pick.author,
    headline: `"${pick.text}" — ${pick.author}`,
    tags: ["stoic", "philosophy", "wisdom"],
    note: "Settled on Base for 0.001 USDC.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}
