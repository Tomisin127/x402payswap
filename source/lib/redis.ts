import { Redis } from "@upstash/redis"

// Upstash Redis client used for x402 replay protection.
// Stores a hash of each successful X-PAYMENT header for 24h so the same
// payment proof cannot be submitted twice.
export const redis = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
})

const REPLAY_TTL_SECONDS = 60 * 60 * 24 // 24 hours

/**
 * Deterministically hash an arbitrary string using Web Crypto (edge-safe).
 * Used to turn the X-PAYMENT header into a compact replay key.
 */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest("SHA-256", data)
  const bytes = new Uint8Array(digest)
  let hex = ""
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, "0")
  }
  return hex
}

/**
 * Returns true if the payment key was recorded successfully (first use).
 * Returns false if it already existed (replay attempt).
 */
export async function recordPaymentOnce(paymentKey: string): Promise<boolean> {
  const key = `x402:paid:${paymentKey}`
  // NX = only set if not exists. If set() returns null, key already existed.
  const result = await redis.set(key, "1", { ex: REPLAY_TTL_SECONDS, nx: true })
  return result === "OK"
}
