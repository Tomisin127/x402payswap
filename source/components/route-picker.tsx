"use client"

import { useState } from "react"
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
  Check,
  ChevronDown,
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
  selected: PaidEndpointMeta
  onSelect: (endpoint: PaidEndpointMeta) => void
}

export function RoutePicker({ selected, onSelect }: Props) {
  const [open, setOpen] = useState(false)
  const SelectedIcon = ICONS[selected.icon]

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2.5 text-left transition hover:border-primary/50"
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
            <SelectedIcon className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{selected.title}</span>
            <span className="block truncate font-mono text-xs text-muted-foreground">
              {selected.path}
            </span>
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition", open && "rotate-180")} />
      </button>

      {open && (
        <>
          <button
            type="button"
            className="fixed inset-0 z-10"
            aria-label="Close route picker"
            onClick={() => setOpen(false)}
          />
          <div
            role="listbox"
            className="absolute left-0 right-0 top-full z-20 mt-1.5 max-h-80 overflow-auto rounded-lg border border-border bg-popover p-1 shadow-xl"
          >
            {PAID_ENDPOINTS.map((ep) => {
              const Icon = ICONS[ep.icon]
              const active = ep.path === selected.path
              return (
                <button
                  key={ep.path}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(ep)
                    setOpen(false)
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 rounded-md px-2.5 py-2 text-left transition",
                    active ? "bg-accent" : "hover:bg-accent/60",
                  )}
                >
                  <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{ep.title}</span>
                      <span className="shrink-0 font-mono text-xs text-muted-foreground">
                        {ep.price}
                      </span>
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                      {ep.description}
                    </span>
                  </span>
                  {active && <Check className="mt-2 size-4 shrink-0 text-primary" />}
                </button>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
