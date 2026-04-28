"use client"

import { useState } from "react"
import type { WalletClient } from "viem"
import { ArrowLeftRight } from "lucide-react"
import { WalletConnect } from "@/components/wallet-connect"
import { SwapPanel } from "@/components/swap-panel"
import { ActivityFeed } from "@/components/activity-feed"
import { AggregatorStrip } from "@/components/aggregator-strip"
import { PAID_ENDPOINTS, type PaidEndpointMeta } from "@/lib/endpoints"

export default function Page() {
  const [walletClient, setWalletClient] = useState<WalletClient | null>(null)
  const [address, setAddress] = useState<`0x${string}` | null>(null)
  const [selected, setSelected] = useState<PaidEndpointMeta>(PAID_ENDPOINTS[0])

  return (
    <main className="min-h-dvh bg-background text-foreground">
      <div className="mx-auto flex min-h-dvh max-w-6xl flex-col px-4 py-5 md:px-6">
        {/* Top bar */}
        <header className="mb-5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <ArrowLeftRight className="size-4" />
            </div>
            <div>
              <div className="text-sm font-semibold leading-tight">x402 Swap</div>
              <div className="text-xs text-muted-foreground">
                Pay-per-request aggregator · Base
              </div>
            </div>
          </div>
          <WalletConnect
            walletClient={walletClient}
            address={address}
            onConnect={(c, a) => {
              setWalletClient(c)
              setAddress(a)
            }}
            onDisconnect={() => {
              setWalletClient(null)
              setAddress(null)
            }}
          />
        </header>

        {/* Main: swap panel + activity feed */}
        <section className="grid flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <SwapPanel
            walletClient={walletClient}
            address={address}
            selected={selected}
            onSelect={setSelected}
          />
          <aside className="min-h-[420px] lg:min-h-0">
            <ActivityFeed address={address} />
          </aside>
        </section>

        {/* Route aggregator */}
        <div className="mt-5">
          <AggregatorStrip selectedPath={selected.path} onSelect={setSelected} />
        </div>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>Payments settle on Base mainnet via the Coinbase CDP facilitator.</span>
          <span className="font-mono">x402 · exact / base</span>
        </footer>
      </div>
    </main>
  )
}
