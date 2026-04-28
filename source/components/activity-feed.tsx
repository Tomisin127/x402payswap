"use client"

import { useState } from "react"
import useSWR from "swr"
import { ExternalLink, Activity, CheckCircle2, XCircle } from "lucide-react"
import { shortAddress } from "@/lib/wallet"
import { cn } from "@/lib/utils"
import type { SwapLogEntry } from "@/app/api/tx-log/route"

type Props = {
  /** Address to show personal feed for. When null we only show the global feed. */
  address: `0x${string}` | null
}

const fetcher = (url: string) => fetch(url).then((r) => r.json() as Promise<{ entries: SwapLogEntry[] }>)

export function ActivityFeed({ address }: Props) {
  const [scope, setScope] = useLocalScope(address)

  const key =
    scope === "mine" && address
      ? `/api/tx-log?address=${address}`
      : `/api/tx-log?scope=global`
  const { data, isLoading } = useSWR(key, fetcher, {
    refreshInterval: 8000,
    revalidateOnFocus: true,
  })
  const entries = data?.entries ?? []

  return (
    <div className="flex h-full flex-col rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Activity className="size-4 text-primary" />
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>
        <div className="flex items-center gap-1 rounded-md border border-border bg-background p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setScope("global")}
            className={cn(
              "rounded px-2 py-1 transition",
              scope === "global" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Global
          </button>
          <button
            type="button"
            onClick={() => setScope("mine")}
            disabled={!address}
            className={cn(
              "rounded px-2 py-1 transition disabled:cursor-not-allowed disabled:opacity-40",
              scope === "mine" ? "bg-accent text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            Mine
          </button>
        </div>
      </header>

      <ol className="flex min-h-0 flex-1 flex-col divide-y divide-border overflow-auto">
        {isLoading && entries.length === 0 ? (
          <EmptyState label="Loading recent swaps…" />
        ) : entries.length === 0 ? (
          <EmptyState
            label={scope === "mine" ? "No swaps yet. Swap once to see it here." : "No swaps yet. Be the first."}
          />
        ) : (
          entries.map((e) => <LogRow key={e.id} entry={e} />)
        )}
      </ol>
    </div>
  )
}

function LogRow({ entry }: { entry: SwapLogEntry }) {
  const ok = entry.status === "success"
  const StatusIcon = ok ? CheckCircle2 : XCircle
  return (
    <li className="flex items-start gap-3 px-4 py-3 text-sm">
      <StatusIcon
        className={cn("mt-0.5 size-4 shrink-0", ok ? "text-primary" : "text-destructive")}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate font-medium">{entry.title}</span>
          <span className="shrink-0 font-mono text-xs text-muted-foreground">
            {entry.priceUsd}
          </span>
        </div>
        <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
          {entry.endpoint}
        </div>
        <div className="mt-1 line-clamp-2 text-xs text-muted-foreground">{entry.summary}</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span>{timeAgo(entry.ts)}</span>
          {entry.payer && <span className="font-mono">{shortAddress(entry.payer)}</span>}
          {entry.txHash && (
            <a
              href={`https://basescan.org/tx/${entry.txHash}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
            >
              {shortAddress(entry.txHash)}
              <ExternalLink className="size-3" />
            </a>
          )}
        </div>
      </div>
    </li>
  )
}

function EmptyState({ label }: { label: string }) {
  return (
    <li className="flex flex-1 items-center justify-center px-4 py-10 text-center text-sm text-muted-foreground">
      {label}
    </li>
  )
}

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000))
  if (s < 60) return `${s}s ago`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

// Tiny local state hook so the user's scope choice survives re-renders
// without dragging in a store or query-params for a two-value toggle.
function useLocalScope(address: `0x${string}` | null) {
  const [scope, setScope] = useState<"global" | "mine">("global")
  // If they disconnect, force back to global.
  if (scope === "mine" && !address) {
    return ["global", setScope] as const
  }
  return [scope, setScope] as const
}
