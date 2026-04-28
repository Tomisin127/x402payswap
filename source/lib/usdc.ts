import type { Hex } from "viem"

/**
 * USDC (FiatTokenV2_2) on Base mainnet.
 * Contract: https://basescan.org/token/0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */
export const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as const

/** EIP-712 domain for EIP-3009 signatures on USDC / Base. */
export const USDC_DOMAIN = {
  name: "USD Coin",
  version: "2",
  chainId: 8453,
  verifyingContract: USDC_BASE_MAINNET,
} as const

/** EIP-712 typed-data types for EIP-3009 `TransferWithAuthorization`. */
export const TRANSFER_WITH_AUTHORIZATION_TYPES = {
  TransferWithAuthorization: [
    { name: "from", type: "address" },
    { name: "to", type: "address" },
    { name: "value", type: "uint256" },
    { name: "validAfter", type: "uint256" },
    { name: "validBefore", type: "uint256" },
    { name: "nonce", type: "bytes32" },
  ],
} as const

/** Minimal ABI for the functions our facilitator needs. */
export const USDC_ABI = [
  {
    type: "function",
    name: "transferWithAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "from", type: "address" },
      { name: "to", type: "address" },
      { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "authorizationState",
    stateMutability: "view",
    inputs: [
      { name: "authorizer", type: "address" },
      { name: "nonce", type: "bytes32" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const

/** x402 EIP-3009 authorization payload (decoded from the X-PAYMENT header). */
export type ExactEvmAuthorization = {
  from: Hex
  to: Hex
  value: string // uint256 as decimal string
  validAfter: string // unix seconds
  validBefore: string // unix seconds
  nonce: Hex // bytes32
}

export type ExactEvmPayload = {
  signature: Hex
  authorization: ExactEvmAuthorization
}
