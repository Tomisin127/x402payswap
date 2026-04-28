import type { Hex } from "viem"
import type { ExactEvmPayload } from "./usdc"

/**
 * Shared types + decoders for facilitator traffic.
 *
 * x402-next posts to /verify and /settle with this body shape (v1):
 * {
 *   x402Version: 1,
 *   paymentPayload | paymentHeader: <object or base64 string>,
 *   paymentRequirements: { ... }
 * }
 *
 * We accept either `paymentPayload` (object) or `paymentHeader` (base64 JSON)
 * to stay compatible with both current and older client versions.
 */

export type PaymentRequirements = {
  scheme: "exact"
  network: "base" | "base-sepolia" | string
  maxAmountRequired: string // atomic USDC units (6 decimals on Base)
  resource: string
  description: string
  mimeType: string
  payTo: Hex
  maxTimeoutSeconds: number
  asset: Hex
  extra?: { name?: string; version?: string }
}

export type ExactEvmPaymentPayload = {
  x402Version: number
  scheme: "exact"
  network: string
  payload: ExactEvmPayload
}

export type FacilitatorRequestBody = {
  x402Version?: number
  paymentPayload?: ExactEvmPaymentPayload | string
  paymentHeader?: ExactEvmPaymentPayload | string
  paymentRequirements: PaymentRequirements
}

export type VerifyResponse =
  | { isValid: true; payer: Hex }
  | { isValid: false; invalidReason: string; payer?: Hex }

export type SettleResponse =
  | {
      success: true
      transaction: Hex
      network: string
      payer: Hex
    }
  | {
      success: false
      errorReason: string
      transaction?: Hex
      network?: string
      payer?: Hex
    }

/** Decode a base64 JSON string if needed, otherwise return the object. */
export function parsePaymentPayload(body: FacilitatorRequestBody): ExactEvmPaymentPayload {
  const raw = body.paymentPayload ?? body.paymentHeader
  if (!raw) throw new Error("Missing paymentPayload / paymentHeader")
  if (typeof raw === "string") {
    const decoded = Buffer.from(raw, "base64").toString("utf8")
    return JSON.parse(decoded) as ExactEvmPaymentPayload
  }
  return raw
}
