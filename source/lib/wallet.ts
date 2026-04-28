"use client"

import { createWalletClient, custom, type WalletClient } from "viem"
import { base } from "viem/chains"

/**
 * Minimal EIP-1193 provider type. Works with MetaMask, Coinbase Wallet,
 * Rainbow, and anything else injected at `window.ethereum`.
 */
type Eip1193Provider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
  on?: (event: string, listener: (...args: unknown[]) => void) => void
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider
  }
}

export const BASE_CHAIN_ID_HEX = "0x2105" // 8453
export const BASE_CHAIN_ID = 8453

async function ensureBase(provider: Eip1193Provider) {
  const chainId = (await provider.request({ method: "eth_chainId" })) as string
  if (chainId.toLowerCase() === BASE_CHAIN_ID_HEX) return
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    })
  } catch {
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: BASE_CHAIN_ID_HEX,
          chainName: "Base",
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: ["https://mainnet.base.org"],
          blockExplorerUrls: ["https://basescan.org"],
        },
      ],
    })
  }
}

function buildClient(provider: Eip1193Provider, address: `0x${string}`): WalletClient {
  return createWalletClient({
    account: address,
    chain: base,
    transport: custom(provider),
  })
}

/**
 * Connect any injected EIP-1193 wallet (MetaMask, Coinbase Wallet EOA,
 * Rabby, Brave, etc.). Switches to Base mainnet if needed.
 */
export async function connectBaseWallet(): Promise<{
  client: WalletClient
  address: `0x${string}`
}> {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No browser wallet detected. Install MetaMask, Rabby, or Coinbase Wallet to continue.",
    )
  }

  const provider = window.ethereum
  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts || accounts.length === 0) {
    throw new Error("No account returned by the wallet.")
  }
  const address = accounts[0] as `0x${string}`

  await ensureBase(provider)

  return { client: buildClient(provider, address), address }
}

/**
 * Connect to the standalone Coinbase Smart Wallet (keys.coinbase.com) via the
 * Coinbase Wallet SDK with `preference: "smartWalletOnly"`. Resulting wallet
 * cannot sign raw EIP-3009 — pay-client will transparently fall back to the
 * on-chain USDC.transfer path for x402 payments.
 */
export async function connectCoinbaseSmartWallet(): Promise<{
  client: WalletClient
  address: `0x${string}`
}> {
  if (typeof window === "undefined") {
    throw new Error("Smart Wallet can only be connected from the browser.")
  }

  // Dynamic import keeps the Coinbase SDK out of the server bundle.
  const mod = await import("@coinbase/wallet-sdk")
  const createSdk = (mod as { createCoinbaseWalletSDK?: typeof mod.createCoinbaseWalletSDK })
    .createCoinbaseWalletSDK

  if (typeof createSdk !== "function") {
    throw new Error(
      "Coinbase Wallet SDK is too old — please upgrade to @coinbase/wallet-sdk v4 or newer.",
    )
  }

  // `preference.options: "smartWalletOnly"` forces the keys.coinbase.com
  // smart-wallet popup, even if the Coinbase Wallet browser extension is
  // installed.
  const sdk = createSdk({
    appName: "x402 Swap",
    appLogoUrl: "https://www.coinbase.com/favicon.ico",
    appChainIds: [BASE_CHAIN_ID],
    preference: {
      options: "smartWalletOnly",
      attribution: { auto: true },
    },
  })

  const provider = sdk.getProvider() as unknown as Eip1193Provider

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[]
  if (!accounts || accounts.length === 0) {
    throw new Error("Coinbase Smart Wallet returned no accounts.")
  }
  const address = accounts[0] as `0x${string}`

  await ensureBase(provider)

  return { client: buildClient(provider, address), address }
}

export function shortAddress(addr: string): string {
  if (!addr) return ""
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}
