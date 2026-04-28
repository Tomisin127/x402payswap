import { NextResponse } from "next/server"
import { redis } from "@/lib/redis"

/**
 * Persistent, Redis-backed swap log.
 *
 * - GET  /api/tx-log?address=0x...   → last 30 swaps for that payer (personal history)
 * - GET  /api/tx-log?scope=global    → last 30 swaps across all payers (activity feed)
 * - POST /api/tx-log                  → record a new swap (called by the client after
 *                                       a successful settle). We also dedupe on tx hash.
 *
 * We keep two ordered lists per scope using sorted sets (score = unix ms) so we
 * can page backwards, then fan writes out to both the global feed and the payer
 * feed so the activity panel stays cheap to read.
 */

export const runtime = "nodejs"

const MAX_ENTRIES = 30
const GLOBAL_KEY = "x402:swap:global"
const payerKey = (addr: string) => `x402:swap:payer:${addr.toLowerCase()}`
const detailKey = (id: string) => `x402:swap:detail:${id}`

export type SwapLogEntry = {
  id: string
  ts: number
  endpoint: string
  title: string
  priceUsd: string
  txHash: string | null
  payer: string | null
  status: "success" | "error"
  summary: string
}

function isSwapLogEntry(x: unknown): x is SwapLogEntry {
  if (!x || typeof x !== "object") return false
  const r = x as Record<string, unknown>
  return (
    typeof r.id === "string" &&
    typeof r.ts === "number" &&
    typeof r.endpoint === "string" &&
    typeof r.title === "string" &&
    typeof r.priceUsd === "string" &&
    typeof r.status === "string" &&
    typeof r.summary === "string"
  )
}

export async function GET(req: Request) {
  const url = new URL(req.url)
  const address = url.searchParams.get("address")
  const scope = url.searchParams.get("scope")

  const key = scope === "global" || !address ? GLOBAL_KEY : payerKey(address)

  // Newest first.
  const ids = (await redis.zrange(key, 0, MAX_ENTRIES - 1, { rev: true })) as string[]
  if (ids.length === 0) return NextResponse.json({ entries: [] })

  // Pipeline GETs for all detail records.
  const pipeline = redis.pipeline()
  ids.forEach((id) => pipeline.get(detailKey(id)))
  const raw = (await pipeline.exec()) as unknown[]

  const entries = raw
    .map((r) => (typeof r === "string" ? (JSON.parse(r) as unknown) : r))
    .filter(isSwapLogEntry)

  return NextResponse.json({ entries })
}

export async function POST(req: Request) {
  let body: Partial<SwapLogEntry>
  try {
    body = (await req.json()) as Partial<SwapLogEntry>
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 })
  }

  if (!body.endpoint || !body.title || !body.priceUsd || !body.summary || !body.status) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 })
  }

  const id = body.txHash ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const entry: SwapLogEntry = {
    id,
    ts: Date.now(),
    endpoint: body.endpoint,
    title: body.title,
    priceUsd: body.priceUsd,
    txHash: body.txHash ?? null,
    payer: body.payer ?? null,
    status: body.status,
    summary: body.summary.slice(0, 240),
  }

  const pipeline = redis.pipeline()
  // Store detail for 7 days.
  pipeline.set(detailKey(id), JSON.stringify(entry), { ex: 60 * 60 * 24 * 7 })
  // Global feed.
  pipeline.zadd(GLOBAL_KEY, { score: entry.ts, member: id })
  pipeline.zremrangebyrank(GLOBAL_KEY, 0, -(MAX_ENTRIES + 1))
  // Payer feed.
  if (entry.payer) {
    pipeline.zadd(payerKey(entry.payer), { score: entry.ts, member: id })
    pipeline.zremrangebyrank(payerKey(entry.payer), 0, -(MAX_ENTRIES + 1))
  }
  await pipeline.exec()

  return NextResponse.json({ entry })
}
