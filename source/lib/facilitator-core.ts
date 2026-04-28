import {
  createPublicClient,
  createWalletClient,
  http,
  encodeFunctionData,
  verifyTypedData,
  parseSignature,
  type Hex,
} from "viem"
import { privateKeyToAccount } from "viem/accounts"
import { base } from "viem/chains"
import {
  USDC_ABI,
  USDC_BASE_MAINNET,
  USDC_DOMAIN,
  TRANSFER_WITH_AUTHORIZATION_TYPES,
  type ExactEvmAuthorization,
} from "./usdc"
import type { ExactEvmPaymentPayload, PaymentRequirements } from "./x402"
import { appendAttribution } from "./attribution"

/** Shared viem clients — reused across verify/settle invocations. */
const RPC_URL = process.env.BASE_RPC_URL || "https://mainnet.base.org"

export const publicClient = createPublicClient({
  chain: base,
  transport: http(RPC_URL),
})

/** Lazily create the wallet client so missing keys don't crash verify calls. */
export function getWalletClient() {
  const pk = process.env.FACILITATOR_PRIVATE_KEY
  if (!pk) throw new Error("FACILITATOR_PRIVATE_KEY is not set")
  const normalized = (pk.startsWith("0x") ? pk : `0x${pk}`) as Hex
  const account = privateKeyToAccount(normalized)
  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http(RPC_URL),
  })
  return { account, walletClient }
}

export type VerifyResult =
  | { ok: true; payer: Hex; authorization: ExactEvmAuthorization }
  | { ok: false; reason: string; payer?: Hex }

/**
 * Verify an x402 "exact" payment payload against the merchant's requirements.
 * Runs all off-chain + one on-chain check (authorizationState). No tx is sent.
 */
export async function verifyExactEvmPayment(
  payload: ExactEvmPaymentPayload,
  requirements: PaymentRequirements,
): Promise<VerifyResult> {
  if (payload.scheme !== "exact") {
    return { ok: false, reason: `Unsupported scheme: ${payload.scheme}` }
  }
  if (payload.network !== requirements.network) {
    return {
      ok: false,
      reason: `Network mismatch: payload=${payload.network} requirements=${requirements.network}`,
    }
  }
  if (requirements.network !== "base") {
    return { ok: false, reason: `This facilitator only supports Base mainnet` }
  }
  if (requirements.asset.toLowerCase() !== USDC_BASE_MAINNET.toLowerCase()) {
    return { ok: false, reason: `Unsupported asset: ${requirements.asset}` }
  }

  const auth = payload.payload.authorization
  const sig = payload.payload.signature

  // 1. Recipient must match the merchant's payTo.
  if (auth.to.toLowerCase() !== requirements.payTo.toLowerCase()) {
    return { ok: false, reason: "Authorization 'to' does not match payTo", payer: auth.from }
  }

  // 2. Amount must meet or exceed what the merchant asks for.
  const value = BigInt(auth.value)
  const required = BigInt(requirements.maxAmountRequired)
  if (value < required) {
    return {
      ok: false,
      reason: `Insufficient amount: sent ${value} < required ${required}`,
      payer: auth.from,
    }
  }

  // 3. Time bounds must be currently valid.
  const now = BigInt(Math.floor(Date.now() / 1000))
  const validAfter = BigInt(auth.validAfter)
  const validBefore = BigInt(auth.validBefore)
  if (now <= validAfter) {
    return { ok: false, reason: "Authorization not yet valid", payer: auth.from }
  }
  if (now >= validBefore) {
    return { ok: false, reason: "Authorization expired", payer: auth.from }
  }

  // 4. Verify the EIP-712 signature matches `from`.
  const validSig = await verifyTypedData({
    address: auth.from,
    domain: USDC_DOMAIN,
    types: TRANSFER_WITH_AUTHORIZATION_TYPES,
    primaryType: "TransferWithAuthorization",
    message: {
      from: auth.from,
      to: auth.to,
      value,
      validAfter,
      validBefore,
      nonce: auth.nonce,
    },
    signature: sig,
  })
  if (!validSig) {
    return { ok: false, reason: "Invalid EIP-712 signature", payer: auth.from }
  }

  // 5. Nonce must not already be used on USDC.
  const used = (await publicClient.readContract({
    address: USDC_BASE_MAINNET,
    abi: USDC_ABI,
    functionName: "authorizationState",
    args: [auth.from, auth.nonce],
  })) as boolean
  if (used) {
    return { ok: false, reason: "Authorization nonce already used", payer: auth.from }
  }

  // 6. Payer must hold at least `value` USDC.
  const balance = (await publicClient.readContract({
    address: USDC_BASE_MAINNET,
    abi: USDC_ABI,
    functionName: "balanceOf",
    args: [auth.from],
  })) as bigint
  if (balance < value) {
    return {
      ok: false,
      reason: `Insufficient USDC balance: ${balance} < ${value}`,
      payer: auth.from,
    }
  }

  return { ok: true, payer: auth.from, authorization: auth }
}

/**
 * Submit the signed authorization on-chain, appending the ERC-8021 attribution
 * suffix (e.g. your `bc_...` builder code) to the calldata. Returns the tx hash
 * once mined.
 */
export async function settleExactEvmPayment(
  auth: ExactEvmAuthorization,
  signature: Hex,
): Promise<Hex> {
  const { account, walletClient } = getWalletClient()

  // 1. Split signature into (v, r, s) for transferWithAuthorization.
  //    EIP-3009 uses the classic v/r/s form, not the packed 65-byte form.
  const parsed = parseSignature(signature)
  // viem normalises v to 27/28; fall back to yParity if v is undefined.
  const vByte =
    parsed.v !== undefined ? Number(parsed.v) : (parsed.yParity ?? 0) === 1 ? 28 : 27

  // 2. Build canonical transferWithAuthorization calldata.
  const baseCalldata = encodeFunctionData({
    abi: USDC_ABI,
    functionName: "transferWithAuthorization",
    args: [
      auth.from,
      auth.to,
      BigInt(auth.value),
      BigInt(auth.validAfter),
      BigInt(auth.validBefore),
      auth.nonce,
      vByte,
      parsed.r,
      parsed.s,
    ],
  })

  // 3. Append the ERC-8021 attribution suffix (no-op if BASE_BUILDER_CODE unset).
  const dataWithAttribution = appendAttribution(baseCalldata)

  // 4. Fire the tx. USDC ignores trailing calldata bytes, so the suffix rides along.
  const hash = await walletClient.sendTransaction({
    account,
    to: USDC_BASE_MAINNET,
    data: dataWithAttribution,
    value: 0n,
  })

  // 5. Wait for inclusion so the caller knows it's actually settled.
  const receipt = await publicClient.waitForTransactionReceipt({ hash })
  if (receipt.status !== "success") {
    throw new Error(`Settlement tx reverted: ${hash}`)
  }
  return hash
}

/** Convenience check: numeric uint → decimal string for JSON transport. */
export function toStringBig(v: bigint | string | number) {
  return typeof v === "bigint" ? v.toString() : String(v)
}

/** Provide a constant safeish for logs without leaking secrets. */
export function redactAddress(addr?: string) {
  if (!addr) return ""
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
