import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.01
 * Composes a 5-7-5 haiku from seasonal fragments. Optional `?topic=` param
 * steers the final line.
 */

const LINE_5 = [
  "Silent gas fees drift",
  "Ledger hums at dusk",
  "Mempool cherry blooms",
  "Old wallets wake slow",
  "Moonlit private key",
]

const LINE_7 = [
  "A thousand nonces cross the void",
  "Calldata settles like spring snow",
  "Validators sigh and then exhale",
  "Finality arrives unannounced",
  "Bytes fold gently into the chain",
]

const LINE_5_FALLBACK = [
  "Morning block returns",
  "Base hums, cool and blue",
  "Small stablecoin falls",
  "Agent dreams onchain",
  "Hash leaves no footprint",
]

function topicLine(topic: string | null) {
  if (!topic) return pick(LINE_5_FALLBACK)
  const clean = topic.trim().toLowerCase().slice(0, 24)
  // Try to finish with a 5-ish syllable line about the topic (approximate).
  const variants = [
    `Soft ${clean} returns`,
    `${capitalize(clean)} on the wind`,
    `Dream of ${clean} stays`,
    `Quiet ${clean} hums`,
    `${capitalize(clean)} becomes chain`,
  ]
  return pick(variants)
}

function capitalize(s: string) {
  return s.slice(0, 1).toUpperCase() + s.slice(1)
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
  const topic = url.searchParams.get("topic")

  const lines = [pick(LINE_5), pick(LINE_7), topicLine(topic)]

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    topic: topic ?? null,
    haiku: lines,
    haikuText: lines.join("\n"),
    note: "A haiku, settled on Base for 0.01 USDC.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}
