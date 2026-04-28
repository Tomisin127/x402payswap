import { parseEventLogs, type Hex } from "viem"
import { publicClient } from "./facilitator-core"
import { USDC_BASE_MAINNET } from "./usdc"
import { recordPaymentOnce, sha256Hex } from "./redis"
import { priceToAtomicUsdc, type PaidEndpointMeta } from "./endpoints"

/**
 * Smart-Wallet x402 verification.
 * --------------------------------
 * Coinbase Smart Wallet (and other ERC-4337 / EIP-1271 wallets) cannot
 * produce a raw secp256k1 EIP-3009 signature, so the standard `exact` x402
 * scheme fails for them with "invalid signature length".
 *
 * Workaround: the smart wallet just sends a regular USDC.transfer to the
 * merchant's payTo, then submits the resulting tx hash via the
 * `X-PAYMENT-SW` header. We verify the on-chain Transfer log matches the
 * required amount + recipient, mark the tx hash as used in Redis, and let
 * the request through.
 *
 * Header format: base64(JSON({ txHash, payer, network: "base" }))
 */

const USDC_TRANSFER_EVENT = {
  type: "event",
  name: "Transfer",
  inputs: [
    { name: "from", type: "address", indexed: true },
    { name: "to", type: "address", indexed: true },
    { name: "value", type: "uint256", indexed: false },
  ],
} as const

export type SwPaymentHeader = {
  txHash: Hex
  payer: Hex
  network: "base"
}

export type SwVerifyResult =
  | {
      ok: true
      settlementHeader: string
      payer: Hex
      txHash: Hex
    }
  | {
      ok: false
      reason: string
    }

function decodeHeader(header: string): SwPaymentHeader | null {
  try {
    const json = Buffer.from(header, "base64").toString("utf8")
    const parsed = JSON.parse(json)
    if (
      parsed &&
      typeof parsed.txHash === "string" &&
      typeof parsed.payer === "string" &&
      parsed.network === "base"
    ) {
      return parsed as SwPaymentHeader
    }
    return null
  } catch {
    return null
  }
}

export async function verifySmartWalletPayment(args: {
  header: string
  endpoint: PaidEndpointMeta
  payTo: Hex
}): Promise<SwVerifyResult> {
  const decoded = decodeHeader(args.header)
  if (!decoded) {
    return { ok: false, reason: "Malformed X-PAYMENT-SW header" }
  }
  if (!/^0x[0-9a-fA-F]{64}$/.test(decoded.txHash)) {
    return { ok: false, reason: "Invalid tx hash" }
  }
  if (!/^0x[0-9a-fA-F]{40}$/.test(decoded.payer)) {
    return { ok: false, reason: "Invalid payer address" }
  }

  const required = priceToAtomicUsdc(args.endpoint.price)

  // Replay protection — same tx hash + endpoint can't unlock twice.
  const replayKey = await sha256Hex(`sw:${decoded.txHash}:${args.endpoint.path}`)
  const firstUse = await recordPaymentOnce(replayKey)
  if (!firstUse) {
    return { ok: false, reason: "This tx hash has already unlocked this endpoint" }
  }

  let receipt: Awaited<ReturnType<typeof publicClient.getTransactionReceipt>> | null = null
  try {
    receipt = await publicClient.getTransactionReceipt({ hash: decoded.txHash })
  } catch {
    return { ok: false, reason: "Transaction not yet visible on Base — wait for inclusion" }
  }
  if (!receipt) {
    return { ok: false, reason: "Transaction not found on Base" }
  }
  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction reverted" }
  }

  // Find a USDC Transfer event going to our payTo for at least `required`
  // atomic units, originating from the declared payer. Using event logs
  // (rather than tx.input decoding) keeps this compatible with both EOA
  // calls and ERC-4337 user ops where tx.from is the bundler.
  const logs = parseEventLogs({
    abi: [USDC_TRANSFER_EVENT],
    logs: receipt.logs,
    eventName: "Transfer",
  })

  const match = logs.find(
    (l) =>
      l.address.toLowerCase() === USDC_BASE_MAINNET.toLowerCase() &&
      (l.args.to as Hex).toLowerCase() === args.payTo.toLowerCase() &&
      (l.args.from as Hex).toLowerCase() === decoded.payer.toLowerCase() &&
      (l.args.value as bigint) >= required,
  )

  if (!match) {
    return {
      ok: false,
      reason: `No matching USDC Transfer of ≥ ${required} atomic units from ${decoded.payer} to ${args.payTo}`,
    }
  }

  // Settlement header (mirrors the format Coinbase's facilitator returns)
  // so the route handler / client log code path stays unified.
  const settlementBody = {
    success: true,
    transaction: decoded.txHash,
    network: "base",
    payer: decoded.payer,
  }
  const settlementHeader = Buffer.from(JSON.stringify(settlementBody)).toString("base64")

  return {
    ok: true,
    settlementHeader,
    payer: decoded.payer,
    txHash: decoded.txHash,
  }
}
