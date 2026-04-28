"use client"

import { useEffect, useMemo, useState } from "react"
import { mutate } from "swr"
import type { WalletClient } from "viem"
import { ArrowDown, Loader2, Zap, ExternalLink, AlertTriangle, Download } from "lucide-react"
import { swap } from "@/lib/pay-client"
import { type PaidEndpointMeta } from "@/lib/endpoints"
import { RoutePicker } from "@/components/route-picker"
import { Button } from "@/components/ui/button"
import { shortAddress } from "@/lib/wallet"

type Props = {
  walletClient: WalletClient | null
  address: `0x${string}` | null
  selected: PaidEndpointMeta
  onSelect: (ep: PaidEndpointMeta) => void
}

type Status = "idle" | "swapping" | "success" | "error"

export function SwapPanel({ walletClient, address, selected, onSelect }: Props) {
  const [paramValues, setParamValues] = useState<Record<string, string>>({})
  const [status, setStatus] = useState<Status>("idle")
  const [error, setError] = useState<string | null>(null)
  const [output, setOutput] = useState<unknown>(null)
  const [lastTx, setLastTx] = useState<{ hash: string | null; payer: string | null } | null>(null)

  // Reset outputs when the route changes so the "to" side is obviously empty.
  useEffect(() => {
    setOutput(null)
    setLastTx(null)
    setStatus("idle")
    setError(null)
    setParamValues({})
  }, [selected.path])

  const queryString = useMemo(() => {
    const entries = Object.entries(paramValues).filter(([, v]) => v.trim().length > 0)
    if (entries.length === 0) return ""
    return "?" + entries.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join("&")
  }, [paramValues])

  const missingRequired = useMemo(
    () =>
      (selected.params ?? []).some(
        (p) => p.required && !(paramValues[p.name]?.trim().length > 0),
      ),
    [selected.params, paramValues],
  )

  async function handleSwap() {
    if (!walletClient || !address) return
    setStatus("swapping")
    setError(null)
    setOutput(null)
    setLastTx(null)

    try {
      const { response, settlement } = await swap(
        `${selected.path}${queryString}`,
        walletClient,
      )

      if (!response.ok) {
        const raw = await response.text().catch(() => "")
        let parsed: Record<string, unknown> | null = null
        try {
          parsed = raw ? JSON.parse(raw) : null
        } catch {
          parsed = null
        }
        const rawMessage =
          (parsed?.error as string) ||
          (parsed?.message as string) ||
          raw ||
          `Request failed with ${response.status}`

        // Translate cryptic facilitator codes into actionable messages.
        // `invalid_payload` is what CDP returns when the signature can't be
        // validated by USDC's on-chain `transferWithAuthorization` —
        // exclusively a smart-wallet (ERC-1271 / ERC-6492) issue, since
        // USDC native uses `ecrecover` and only accepts EOA signatures.
        const message = humanizePaymentError(rawMessage, response.status)

        await fetch("/api/tx-log", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            endpoint: selected.path,
            title: selected.title,
            priceUsd: selected.price,
            txHash: settlement.txHash,
            payer: settlement.payer ?? address,
            status: "error",
            summary: message.slice(0, 200),
          }),
        }).catch(() => {})

        throw new Error(message)
      }

      // Defensive: if the upstream (e.g. CDP facilitator) returns plaintext
      // like "Unauthorized" with a 200-ish status, response.json() would
      // throw "Unexpected token 'U'…". Read text first, then try to parse.
      const rawBody = await response.text()
      let json: unknown
      try {
        json = rawBody ? JSON.parse(rawBody) : null
      } catch {
        throw new Error(
          rawBody.trim().length > 0
            ? `Server returned a non-JSON response: "${rawBody.slice(0, 160)}"`
            : "Server returned an empty response.",
        )
      }
      setOutput(json)
      setLastTx({ hash: settlement.txHash, payer: settlement.payer })
      setStatus("success")

      // Fire-and-forget log + feed revalidation.
      const summary = summarise(json)
      fetch("/api/tx-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: `${selected.path}${queryString}`,
          title: selected.title,
          priceUsd: selected.price,
          txHash: settlement.txHash,
          payer: settlement.payer ?? address,
          status: "success",
          summary,
        }),
      })
        .then(() => {
          mutate("/api/tx-log?scope=global")
          if (address) mutate(`/api/tx-log?address=${address}`)
        })
        .catch(() => {})
    } catch (err) {
      const message = err instanceof Error ? err.message : "Swap failed"
      setError(message)
      setStatus("error")
    }
  }

  const notConnected = !walletClient || !address

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      {/* FROM */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-muted-foreground">
          <span>You pay</span>
          <span>Base mainnet</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <div className="font-mono text-3xl font-semibold tabular-nums">
            {selected.price.replace("$", "")}
          </div>
          <div className="flex items-center gap-2 rounded-full border border-border bg-card px-2.5 py-1 text-sm">
            <span className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
              $
            </span>
            <span className="font-medium">USDC</span>
          </div>
        </div>
      </div>

      {/* Swap arrow */}
      <div className="relative z-[1] my-[-10px] flex justify-center">
        <div className="flex size-9 items-center justify-center rounded-xl border border-border bg-card">
          <ArrowDown className="size-4" />
        </div>
      </div>

      {/* TO */}
      <div className="rounded-xl border border-border bg-background p-4">
        <div className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">You receive</div>
        <RoutePicker selected={selected} onSelect={onSelect} />

        {(selected.params ?? []).length > 0 && (
          <div className="mt-3 space-y-2">
            {(selected.params ?? []).map((p) => (
              <div key={p.name}>
                <label
                  htmlFor={`param-${p.name}`}
                  className="mb-1 flex items-center justify-between text-xs text-muted-foreground"
                >
                  <span className="font-mono">{p.name}</span>
                  <span>{p.required ? "required" : "optional"}</span>
                </label>
                <input
                  id={`param-${p.name}`}
                  value={paramValues[p.name] ?? ""}
                  onChange={(e) => setParamValues((s) => ({ ...s, [p.name]: e.target.value }))}
                  placeholder={p.description}
                  className="h-9 w-full rounded-md border border-border bg-card px-3 text-sm outline-none transition placeholder:text-muted-foreground focus:border-primary"
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Rate row */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted-foreground">
        <span>
          Rate: <span className="font-mono text-foreground">{selected.price}</span> → 1 response
        </span>
        <span>Settled via Coinbase CDP</span>
      </div>

      {/* Action */}
      <div className="mt-3">
        {notConnected ? (
          <Button disabled className="h-12 w-full text-base" size="lg">
            Connect wallet to swap
          </Button>
        ) : missingRequired ? (
          <Button disabled className="h-12 w-full text-base" size="lg">
            Enter required params
          </Button>
        ) : status === "swapping" ? (
          <Button disabled className="h-12 w-full text-base" size="lg">
            <Loader2 className="size-4 animate-spin" />
            Signing + settling on Base…
          </Button>
        ) : (
          <Button onClick={handleSwap} className="h-12 w-full text-base" size="lg">
            <Zap className="size-4" />
            Swap {selected.price} for {selected.title}
          </Button>
        )}
      </div>

      {/* Output */}
      {status === "error" && error && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span className="break-words">{error}</span>
        </div>
      )}

      {status === "success" && output !== null && (
        <div className="mt-3 space-y-2">
          {lastTx?.hash && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background px-3 py-2 text-xs">
              <span className="text-muted-foreground">
                Settled on Base
                {lastTx.payer && <> · {shortAddress(lastTx.payer)}</>}
              </span>
              <a
                href={`https://basescan.org/tx/${lastTx.hash}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-mono text-primary hover:underline"
              >
                {shortAddress(lastTx.hash)}
                <ExternalLink className="size-3" />
              </a>
            </div>
          )}
          {getDownloadLink(output) && (
            <a
              href={getDownloadLink(output) as string}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between gap-3 rounded-lg border border-primary/40 bg-primary/10 px-4 py-3 text-sm font-medium text-primary transition hover:bg-primary/15"
            >
              <span className="flex items-center gap-2">
                <Download className="size-4" />
                Your download is ready — click to start
              </span>
              <ExternalLink className="size-4" />
            </a>
          )}
          <pre className="max-h-72 overflow-auto rounded-lg border border-border bg-background p-3 font-mono text-xs leading-relaxed text-foreground">
            {JSON.stringify(output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  )
}

/**
 * Convert raw facilitator error strings into friendly, actionable text.
 * `invalid_payload` from CDP almost always means the wallet produced a
 * smart-contract signature (ERC-1271 / ERC-6492) for an EIP-3009
 * `transferWithAuthorization`, which USDC's on-chain code rejects.
 */
function humanizePaymentError(raw: string, status: number): string {
  const lc = raw.toLowerCase()

  if (lc.includes("invalid_payload") || lc.includes("invalid signature") || lc.includes("invalid_signature")) {
    return "This wallet can't sign x402 payments. Coinbase Smart Wallet and Base App produce smart-contract signatures, but USDC's on-chain transferWithAuthorization only accepts EOA signatures. Connect with MetaMask, Rabby, or the Coinbase Wallet browser extension instead."
  }
  if (lc.includes("insufficient_funds") || lc.includes("insufficient funds")) {
    return "Insufficient USDC balance on Base. Top up the connected wallet and try again."
  }
  if (lc.includes("expired") || lc.includes("deadline")) {
    return "Payment authorization expired before settlement. Please try again."
  }
  if (lc.includes("payment facilitator unavailable") || lc.includes("facilitator")) {
    return raw // already humanized by middleware
  }
  if (status === 500) {
    return `Server error during payment: ${raw}. Please retry in a moment.`
  }
  return raw
}

function getDownloadLink(json: unknown): string | null {
  if (json && typeof json === "object") {
    const v = (json as Record<string, unknown>).downloadLink
    if (typeof v === "string" && v.startsWith("http")) return v
  }
  return null
}

function summarise(json: unknown): string {
  if (json && typeof json === "object") {
    const r = json as Record<string, unknown>
    for (const k of ["headline", "title", "haiku", "fortune", "roast", "message"]) {
      const v = r[k]
      if (typeof v === "string" && v.length > 0) return v
      if (Array.isArray(v) && typeof v[0] === "string") return (v as string[]).join(" / ")
    }
    if (Array.isArray(r.numbers)) return `Numbers: ${(r.numbers as unknown[]).join(", ")}`
  }
  try {
    return JSON.stringify(json).slice(0, 200)
  } catch {
    return "Response received"
  }
}
