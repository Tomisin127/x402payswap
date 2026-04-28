"use client"

import { useState } from "react"
import type { WalletClient } from "viem"
import { Wallet, LogOut, ChevronDown, Loader2, AlertTriangle } from "lucide-react"
import {
  connectBaseWallet,
  connectCoinbaseSmartWallet,
  shortAddress,
} from "@/lib/wallet"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type WalletKind = "browser" | "smart"

type Props = {
  walletClient: WalletClient | null
  address: `0x${string}` | null
  onConnect: (client: WalletClient, address: `0x${string}`, kind: WalletKind) => void
  onDisconnect: () => void
}

export function WalletConnect({ walletClient, address, onConnect, onDisconnect }: Props) {
  const [busy, setBusy] = useState<WalletKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [kind, setKind] = useState<WalletKind | null>(null)

  async function handleConnect(target: WalletKind) {
    setBusy(target)
    setError(null)
    try {
      const { client, address: addr } =
        target === "smart" ? await connectCoinbaseSmartWallet() : await connectBaseWallet()
      setKind(target)
      onConnect(client, addr, target)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect wallet")
    } finally {
      setBusy(null)
    }
  }

  function handleDisconnect() {
    setKind(null)
    onDisconnect()
  }

  if (walletClient && address) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-card/60 px-3 py-2 text-sm">
          <span className="size-2 rounded-full bg-primary" aria-hidden />
          <span className="font-mono">{shortAddress(address)}</span>
          <span className="text-xs text-muted-foreground">
            {kind === "smart" ? "Smart · Base" : "Base"}
          </span>
        </div>
        <Button variant="ghost" size="icon" onClick={handleDisconnect} aria-label="Disconnect wallet">
          <LogOut className="size-4" />
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" disabled={busy !== null}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Wallet className="size-4" />
            )}
            {busy === "smart"
              ? "Opening Smart Wallet…"
              : busy === "browser"
                ? "Connecting…"
                : "Connect wallet"}
            <ChevronDown className="size-3.5 opacity-70" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel>Choose wallet</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => handleConnect("browser")}>
            <Wallet className="size-4" />
            <div className="flex flex-col">
              <span className="text-sm">Browser wallet</span>
              <span className="text-xs text-muted-foreground">
                MetaMask · Rabby · Coinbase Wallet
              </span>
            </div>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => handleConnect("smart")}>
            <AlertTriangle className="size-4 text-muted-foreground" />
            <div className="flex flex-col">
              <span className="text-sm">Coinbase Smart Wallet</span>
              <span className="text-xs text-muted-foreground">
                Not supported by x402 — USDC needs EOA signatures
              </span>
            </div>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {error && <span className="max-w-[280px] text-right text-xs text-destructive">{error}</span>}
    </div>
  )
}
