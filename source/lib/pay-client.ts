"use client"

import {
  createPublicClient,
  http,
  type Hex,
  type WalletClient,
} from "viem"
import { base } from "viem/chains"

/**
 * Client-side x402 swap flow built on top of viem.
 *
 * Two payment paths are supported transparently:
 *
 *   1. **Standard x402 (`exact` scheme)** — EIP-3009 signed authorization,
 *      verified + settled by Coinbase's hosted facilitator. Used by every
 *      EOA wallet (MetaMask, Rabby, Coinbase Wallet EOA).
 *
 *   2. **Smart-wallet path (`X-PAYMENT-SW`)** — when a wallet returns an
 *      ERC-1271 / ERC-6492 wrapped signature (Coinbase Smart Wallet, Safe,
 *      etc.) we send a regular `USDC.transfer` from the wallet, wait for
 *      inclusion on Base, then submit `{txHash, payer}` to our own
 *      middleware which verifies the on-chain Transfer log.
 *
 * The caller doesn't need to know which path is in play — `swap()` handles
 * the dispatch and returns the same `SwapResult` shape either way.
 */

export type PaymentRequirements = {
  scheme: string
  network: string
  maxAmountRequired: string
  resource: string
  description?: string
  mimeType?: string
  payTo: `0x${string}`
  maxTimeoutSeconds?: number
  asset: `0x${string}`
  extra?: { name?: string; version?: string } | null
}

type AcceptsBody = {
  x402Version?: number
  error?: string
  accepts: PaymentRequirements[]
}

export type SettlementMeta = {
  txHash: `0x${string}` | null
  payer: `0x${string}` | null
  network: string | null
  success: boolean
}

export type SwapResult = {
  response: Response
  settlement: SettlementMeta
  requirements: PaymentRequirements | null
}

const USDC_TRANSFER_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
  if (typeof btoa !== "undefined") return btoa(binary)
  return Buffer.from(binary, "binary").toString("base64")
}

function base64ToString(b64: string): string {
  try {
    if (typeof atob !== "undefined") return atob(b64)
    return Buffer.from(b64, "base64").toString("utf-8")
  } catch {
    return ""
  }
}

function randomNonceHex(): `0x${string}` {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
  return `0x${hex}` as `0x${string}`
}

async function readBody(res: Response): Promise<{ text: string; json: AcceptsBody | null }> {
  const text = await res.text()
  try {
    return { text, json: text ? (JSON.parse(text) as AcceptsBody) : null }
  } catch {
    return { text, json: null }
  }
}

function parseSettlement(res: Response): SettlementMeta {
  const header = res.headers.get("x-payment-response")
  if (!header) return { txHash: null, payer: null, network: null, success: res.ok }
  try {
    const decoded = base64ToString(header)
    const data = JSON.parse(decoded) as {
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

/** EIP-3009 signature must be exactly 65 bytes (0x + 130 hex chars). */
function isEoaSignature(sig: unknown): sig is Hex {
  return typeof sig === "string" && /^0x[0-9a-fA-F]{130}$/.test(sig)
}

/** Lazy public client used to wait for smart-wallet USDC transfer receipts. */
let _publicClient: ReturnType<typeof createPublicClient> | null = null
function getPublicClient() {
  if (!_publicClient) {
    _publicClient = createPublicClient({
      chain: base,
      transport: http("https://mainnet.base.org"),
    })
  }
  return _publicClient
}

/**
 * Smart-wallet fallback: send a normal `USDC.transfer(payTo, value)` from the
 * connected wallet, wait for inclusion, and retry the original request with
 * an `X-PAYMENT-SW` header so our middleware can verify the on-chain Transfer.
 */
async function smartWalletSwap(
  url: string,
  walletClient: WalletClient,
  init: RequestInit,
  requirements: PaymentRequirements,
): Promise<SwapResult> {
  const account = walletClient.account
  if (!account) throw new Error("Wallet has no account connected")

  const value = BigInt(requirements.maxAmountRequired)

  // The smart wallet UX (Coinbase Smart Wallet) will surface a single popup
  // showing the USDC transfer + gas sponsorship details to the user.
  const txHash = (await walletClient.writeContract({
    account,
    chain: base,
    address: requirements.asset,
    abi: USDC_TRANSFER_ABI,
    functionName: "transfer",
    args: [requirements.payTo, value],
  })) as `0x${string}`

  // Wait for the L2 tx to land. Coinbase Smart Wallet's provider returns the
  // canonical L2 hash (not a userOp hash) for `eth_sendTransaction`, so the
  // public client can find it directly.
  await getPublicClient().waitForTransactionReceipt({
    hash: txHash,
    timeout: 60_000,
    pollingInterval: 1_000,
  })

  const swPayload = {
    txHash,
    payer: account.address,
    network: "base" as const,
  }
  const swHeader = bytesToBase64(new TextEncoder().encode(JSON.stringify(swPayload)))

  const headers = new Headers(init.headers ?? {})
  headers.set("X-PAYMENT-SW", swHeader)

  const second = await fetch(url, { ...init, headers })
  return {
    response: second,
    settlement: parseSettlement(second),
    requirements,
  }
}

export async function swap(
  url: string,
  walletClient: WalletClient,
  init: RequestInit = {},
): Promise<SwapResult> {
  const first = await fetch(url, init)
  if (first.status !== 402) {
    return {
      response: first,
      settlement: parseSettlement(first),
      requirements: null,
    }
  }

  const { text, json } = await readBody(first)
  if (!json) {
    throw new Error(
      `Server returned 402 but body wasn't JSON. First bytes: ${text.slice(0, 120)}`,
    )
  }
  const requirements = json.accepts?.[0]
  if (!requirements) throw new Error(json.error || "402 had no payment requirements")
  if (requirements.scheme !== "exact" || requirements.network !== "base") {
    throw new Error(
      `Unsupported scheme/network: ${requirements.scheme}/${requirements.network}`,
    )
  }

  const account = walletClient.account
  if (!account) throw new Error("Wallet has no account connected")

  const now = Math.floor(Date.now() / 1000)
  const validAfter = 0
  const validBefore = now + (requirements.maxTimeoutSeconds ?? 60) + 600
  const nonce = randomNonceHex()

  const authorization = {
    from: account.address,
    to: requirements.payTo,
    value: requirements.maxAmountRequired,
    validAfter: String(validAfter),
    validBefore: String(validBefore),
    nonce,
  } as const

  const domain = {
    name: requirements.extra?.name ?? "USD Coin",
    version: requirements.extra?.version ?? "2",
    chainId: 8453,
    verifyingContract: requirements.asset,
  } as const

  const types = {
    TransferWithAuthorization: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
    ],
  } as const

  let signature: unknown
  try {
    signature = await walletClient.signTypedData({
      account,
      domain,
      types,
      primaryType: "TransferWithAuthorization",
      message: {
        from: authorization.from,
        to: authorization.to,
        value: BigInt(authorization.value),
        validAfter: BigInt(authorization.validAfter),
        validBefore: BigInt(authorization.validBefore),
        nonce,
      },
    })
  } catch (err) {
    // Some smart wallets reject EIP-712 typed-data outright. Treat that as a
    // signal to fall back to the on-chain transfer path so the user can still
    // pay without abandoning the swap.
    const message = err instanceof Error ? err.message : String(err)
    console.log("[v0] signTypedData failed, falling back to smart-wallet path:", message)
    return smartWalletSwap(url, walletClient, init, requirements as PaymentRequirements)
  }

  // Coinbase's hosted x402 facilitator only accepts a standard 65-byte
  // secp256k1 signature. Smart wallets (Coinbase Smart Wallet, Safe, etc.)
  // return ERC-1271 / ERC-6492 wrapped signatures that can be much longer.
  // When we detect that, transparently switch to the on-chain transfer path.
  if (!isEoaSignature(signature)) {
    console.log("[v0] non-EOA signature detected, using smart-wallet path")
    return smartWalletSwap(url, walletClient, init, requirements as PaymentRequirements)
  }

  const paymentPayload = {
    x402Version: json.x402Version ?? 1,
    scheme: "exact",
    network: "base",
    payload: { signature, authorization },
  }
  const headerBytes = new TextEncoder().encode(JSON.stringify(paymentPayload))
  const paymentHeader = bytesToBase64(headerBytes)

  const headers = new Headers(init.headers ?? {})
  headers.set("X-PAYMENT", paymentHeader)

  const second = await fetch(url, { ...init, headers })
  return {
    response: second,
    settlement: parseSettlement(second),
    requirements,
  }
}
