import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.001
 * A simulated railway timetable for any "from → to" pair. Returns the next
 * three departures with realistic-looking times, durations, fares, and gates.
 * Deterministic per (from, to, current 5-minute slot) so consecutive requests
 * feel stable while still refreshing periodically.
 */

const OPERATORS = [
  { code: "BL", name: "Blue Line Express" },
  { code: "NR", name: "Northern Rail" },
  { code: "SC", name: "Sunset Coast" },
  { code: "MX", name: "Metro X" },
  { code: "GR", name: "Grand Continental" },
  { code: "EB", name: "Eastbound Limited" },
]

const TRAIN_TYPES = ["Express", "Regional", "InterCity", "High-Speed", "Sleeper"]

function hashSeed(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

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

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function formatTime(d: Date) {
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`
}

function clean(input: string) {
  return input
    .trim()
    .slice(0, 40)
    .replace(/[^\p{L}\p{N}\s.'-]/gu, "")
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
  const from = clean(url.searchParams.get("from") || "")
  const to = clean(url.searchParams.get("to") || "")
  if (!from || !to) {
    return NextResponse.json(
      {
        error: "Missing stations",
        message: "Pass ?from=NYC&to=BOS (or any city / station code).",
      },
      { status: 400 },
    )
  }
  if (from.toLowerCase() === to.toLowerCase()) {
    return NextResponse.json(
      { error: "Same station", message: "From and To must differ." },
      { status: 400 },
    )
  }

  const slot = Math.floor(Date.now() / (5 * 60_000))
  const seedStr = `${from.toLowerCase()}|${to.toLowerCase()}|${slot}`
  const rng = mulberry32(hashSeed(seedStr))

  const baseDurationMin = 45 + Math.floor(rng() * 240) // 45m–4h45m
  const now = new Date()

  const departures = Array.from({ length: 3 }).map((_, i) => {
    const offset = 8 + Math.floor(rng() * 50) + i * (15 + Math.floor(rng() * 25))
    const dep = new Date(now.getTime() + offset * 60_000)
    const durationVariance = Math.floor((rng() - 0.5) * 14)
    const durationMin = Math.max(30, baseDurationMin + durationVariance)
    const arr = new Date(dep.getTime() + durationMin * 60_000)
    const op = OPERATORS[Math.floor(rng() * OPERATORS.length)]
    const trainType = TRAIN_TYPES[Math.floor(rng() * TRAIN_TYPES.length)]
    const trainNumber = `${op.code}${100 + Math.floor(rng() * 899)}`
    const gate = `${String.fromCharCode(65 + Math.floor(rng() * 8))}${1 + Math.floor(rng() * 24)}`
    const fare = (5 + rng() * 95).toFixed(2)
    const onTime = rng() > 0.18
    const delayMin = onTime ? 0 : 1 + Math.floor(rng() * 24)

    return {
      trainNumber,
      operator: op.name,
      type: trainType,
      departure: formatTime(dep),
      arrival: formatTime(arr),
      durationMin,
      gate,
      fareUsd: Number(fare),
      status: onTime ? "On time" : `Delayed ${delayMin}m`,
      delayMin,
    }
  })

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    route: { from, to },
    queriedAt: now.toISOString(),
    departures,
    note: "Simulated timetable, settled on Base for 0.001 USDC.",
    disclaimer:
      "This feed is a synthetic demo. Wire your operator's GTFS / live API key on the server to return real schedules.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}
