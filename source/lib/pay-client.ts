"use client"

import type { WalletClient } from "viem"
import { wrapFetchWithPayment, decodeXPaymentResponse } from "x402-fetch"

/**
 * Client-side x402 swap flow.
 *
 * Uses the canonical `wrapFetchWithPayment` helper from `x402-fetch`, which:
 *   1. Sends the request.
 *   2. On `402 Payment Required`, parses the accepted payment requirements,
 *      asks the wallet to sign an EIP-3009 `transferWithAuthorization`,
 *      base64-encodes the signed payload, and retries with `X-PAYMENT`.
 *   3. The Coinbase CDP facilitator (configured in `middleware.ts`)
 *      verifies the ECDSA signature and settles the USDC transfer on Base
 *      mainnet. The facilitator returns settlement metadata via the
 *      `X-PAYMENT-RESPONSE` header.
 *
 * NOTE: USDC's on-chain `transferWithAuthorization` only validates EOA
 * (ECDSA) signatures via `ecrecover`. Smart-wallet signatures (ERC-1271 /
 * ERC-6492) are rejected by CDP with `invalid_payload`. The wallet
 * picker (`wallet-connect.tsx`) reflects this; the swap panel translates
 * the error into a clear, actionable message if it ever fires.
 */

export type SettlementMeta = {
  txHash: `0x${string}` | null
  payer: `0x${string}` | null
  network: string | null
  success: boolean
}

export type SwapResult = {
  response: Response
  settlement: SettlementMeta
}

// Cap any single x402 request at $20 USDC (6 decimals -> 20_000_000n atomic).
// This is the per-request safety bound that x402-fetch enforces locally
// before forwarding the signed authorization.
const MAX_USDC_PER_REQUEST = BigInt(20 * 10 ** 6)

function parseSettlement(res: Response): SettlementMeta {
  const header = res.headers.get("x-payment-response")
  if (!header) return { txHash: null, payer: null, network: null, success: res.ok }
  try {
    const data = decodeXPaymentResponse(header) as {
      success?: boolean
      transaction?: string
      payer?: string
      network?: string
    }
    return {
      txHash: (data.transaction as `0x${string}`) ?? null,
      payer: (data.payer as `0x${string}`) ?? null,
      network: data.network ?? null,
      success: data.success ?? res.ok,
    }
  } catch {
    return { txHash: null, payer: null, network: null, success: res.ok }
  }
}

export async function swap(
  url: string,
  walletClient: WalletClient,
  init: RequestInit = {},
): Promise<SwapResult> {
  // x402-fetch's signer type is intentionally narrower than viem's generic
  // WalletClient (it expects a chain to be set). Our `wallet.ts` always
  // creates clients with `chain: base`, so the cast is safe.
  const fetchWithPayment = wrapFetchWithPayment(
    fetch,
    walletClient as Parameters<typeof wrapFetchWithPayment>[1],
    MAX_USDC_PER_REQUEST,
  )

  const response = await fetchWithPayment(url, init)
  return {
    response,
    settlement: parseSettlement(response),
  }
}
