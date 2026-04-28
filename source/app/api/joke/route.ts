import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.001
 * Returns a single PG-rated dad joke. Optional ?category= biases the pick.
 */

type Joke = { setup: string; punchline: string; tags: string[] }

const JOKES: Joke[] = [
  {
    setup: "Why don't scientists trust atoms?",
    punchline: "Because they make up everything.",
    tags: ["science", "tech"],
  },
  {
    setup: "What do you call a fake noodle?",
    punchline: "An impasta.",
    tags: ["food"],
  },
  {
    setup: "Why did the bitcoin go to therapy?",
    punchline: "It had too many unresolved blocks.",
    tags: ["crypto", "tech"],
  },
  {
    setup: "Why did the developer go broke?",
    punchline: "Because he used up all his cache.",
    tags: ["tech"],
  },
  {
    setup: "How does a penguin build its house?",
    punchline: "Igloos it together.",
    tags: ["animal", "general"],
  },
  {
    setup: "Why don't skeletons fight each other?",
    punchline: "They don't have the guts.",
    tags: ["general"],
  },
  {
    setup: "What did the ocean say to the shore?",
    punchline: "Nothing — it just waved.",
    tags: ["general"],
  },
  {
    setup: "Why did the smart contract break up with the developer?",
    punchline: "It found someone with better gas.",
    tags: ["crypto", "tech"],
  },
  {
    setup: "What's a chef's favorite key on the keyboard?",
    punchline: "The escape key — for when the soufflé falls.",
    tags: ["food", "tech"],
  },
  {
    setup: "Why was the stablecoin so calm?",
    punchline: "It had no volatility issues.",
    tags: ["crypto"],
  },
  {
    setup: "What do you call a cow with no legs?",
    punchline: "Ground beef.",
    tags: ["food", "animal"],
  },
  {
    setup: "Why don't programmers like nature?",
    punchline: "Too many bugs.",
    tags: ["tech"],
  },
]

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

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

  const url = new URL(request.url)
  const category = (url.searchParams.get("category") || "").trim().toLowerCase().slice(0, 24)
  const pool = category ? JOKES.filter((j) => j.tags.includes(category)) : JOKES
  const chosen = pool.length > 0 ? pick(pool) : pick(JOKES)

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    category: category || null,
    setup: chosen.setup,
    punchline: chosen.punchline,
    headline: `${chosen.setup} — ${chosen.punchline}`,
    tags: chosen.tags,
    note: "Settled on Base for 0.001 USDC.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}
