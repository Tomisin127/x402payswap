"use client"

import {
  Sparkles,
  Cookie,
  Feather,
  Flame,
  Dices,
  Download,
  CloudSun,
  TrainFront,
  Quote,
  Smile,
} from "lucide-react"
import { PAID_ENDPOINTS, type PaidEndpointMeta, type IconKey } from "@/lib/endpoints"
import { cn } from "@/lib/utils"

const ICONS: Record<IconKey, typeof Sparkles> = {
  sparkles: Sparkles,
  cookie: Cookie,
  feather: Feather,
  flame: Flame,
  dice: Dices,
  download: Download,
  cloud: CloudSun,
  train: TrainFront,
  quote: Quote,
  smile: Smile,
}

type Props = {
  selectedPath: string
  onSelect: (ep: PaidEndpointMeta) => void
}

export function AggregatorStrip({ selectedPath, onSelect }: Props) {
  const uniquePrices = Array.from(new Set(PAID_ENDPOINTS.map((e) => e.price)))
  const priceSummary =
    uniquePrices.length === 1
      ? `all ${uniquePrices[0]} on Base`
      : `${uniquePrices.slice(0, 3).join(" · ")} on Base`

  return (
    <section className="rounded-2xl border border-border bg-card">
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold">Route aggregator</h2>
          <p className="text-xs text-muted-foreground">
            {PAID_ENDPOINTS.length} endpoints · {priceSummary}
          </p>
        </div>
        <a
          href="/api/discover"
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-primary hover:underline"
        >
          /api/discover
        </a>
      </header>

      <ul className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {PAID_ENDPOINTS.map((ep) => {
          const Icon = ICONS[ep.icon]
          const active = ep.path === selectedPath
          return (
            <li key={ep.path}>
              <button
                type="button"
                onClick={() => onSelect(ep)}
                className={cn(
                  "group flex w-full flex-col gap-2 rounded-xl border p-3 text-left transition",
                  active
                    ? "border-primary/50 bg-primary/5"
                    : "border-border bg-background hover:border-primary/30 hover:bg-accent/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md transition",
                      active ? "bg-primary text-primary-foreground" : "bg-primary/15 text-primary",
                    )}
                  >
                    <Icon className="size-4" />
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{ep.price}</span>
                </div>
                <div>
                  <div className="text-sm font-medium leading-tight">{ep.title}</div>
                  <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                    {ep.path}
                  </div>
                </div>
                <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                  {ep.description}
                </p>
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
