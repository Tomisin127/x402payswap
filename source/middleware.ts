import { NextResponse, type NextRequest } from "next/server"
import { paymentMiddleware } from "x402-next"
import { facilitator } from "@coinbase/x402"
import { buildMiddlewareRoutes, PAID_ENDPOINTS } from "@/lib/endpoints"
import { verifySmartWalletPayment } from "@/lib/sw-pay"

/**
 * x402 Payment Middleware — Coinbase CDP facilitator + Smart Wallet bypass.
 * ------------------------------------------------------------------------
 * Two payment paths are accepted:
 *
 *   1. Standard `X-PAYMENT` (EIP-3009 signed authorization)
 *      → forwarded to x402-next + Coinbase's hosted facilitator on Base.
 *      Used by EOA wallets (MetaMask, Rabby, Coinbase Wallet EOA).
 *
 *   2. `X-PAYMENT-SW` (smart-wallet on-chain proof)
 *      → base64(JSON({txHash, payer, network: "base"}))
 *      Used by ERC-4337 / EIP-1271 wallets (Coinbase Smart Wallet, Safe)
 *      that cannot sign raw secp256k1 EIP-3009 authorizations. The wallet
 *      sends a normal USDC.transfer; we verify the Transfer log on-chain,
 *      apply replay protection, and let the request through.
 *
 * Required env vars:
 *   - PAY_TO_ADDRESS       Your receiving wallet on Base (0x...).
 *   - CDP_API_KEY_ID       From portal.cdp.coinbase.com (for path 1)
 *   - CDP_API_KEY_SECRET   From portal.cdp.coinbase.com (for path 1)
 *   - BASE_RPC_URL         Optional; defaults to https://mainnet.base.org
 *   - KV_REST_API_URL      Upstash Redis URL (for SW replay protection)
 *   - KV_REST_API_TOKEN    Upstash Redis token
 */

const payTo = (process.env.PAY_TO_ADDRESS ??
  "0xc0887adf2411c4db859e497c1f931c59600b1ec4") as `0x${string}`

const routes = buildMiddlewareRoutes("base")
const x402 = paymentMiddleware(payTo, routes, facilitator)

console.log(
  "[v0] x402 middleware loaded via CDP facilitator. payTo:",
  payTo,
  "routes:",
  Object.keys(routes),
)

export async function middleware(req: NextRequest) {
  const swHeader = req.headers.get("x-payment-sw")

  if (swHeader) {
    const pathname = new URL(req.url).pathname
    const endpoint = PAID_ENDPOINTS.find((e) => e.path === pathname)
    if (!endpoint) {
      return NextResponse.json(
        { error: "Unknown paid path", message: `No x402 route registered for ${pathname}` },
        { status: 404 },
      )
    }

    try {
      const result = await verifySmartWalletPayment({
        header: swHeader,
        endpoint,
        payTo,
      })

      if (!result.ok) {
        console.log("[v0] x402-sw rejected:", result.reason)
        return NextResponse.json(
          { error: "Smart wallet payment verification failed", message: result.reason },
          { status: 402 },
        )
      }

      console.log("[v0] x402-sw accepted:", {
        path: pathname,
        payer: result.payer,
        tx: result.txHash,
      })

      // Forward the synthetic settlement header so the route handler can mirror
      // it back to the client (the existing handlers already do this).
      const requestHeaders = new Headers(req.headers)
      requestHeaders.set("x-payment-response", result.settlementHeader)

      const res = NextResponse.next({ request: { headers: requestHeaders } })
      res.headers.set("x-payment-response", result.settlementHeader)
      return res
    } catch (err) {
      const message = err instanceof Error ? err.message : "Smart wallet verification error"
      console.log("[v0] x402-sw threw:", message)
      return NextResponse.json(
        { error: "Smart wallet payment verification failed", message },
        { status: 402 },
      )
    }
  }

  // Default path → standard x402 EIP-3009 flow via the CDP facilitator.
  return x402(req)
}

// Next.js requires `config.matcher` to be a literal at compile time (no
// imported constants or expressions), so we spell the paid paths out here.
// Keep this list in sync with lib/endpoints.ts::PAID_ENDPOINTS.
export const config = {
  matcher: [
    "/api/premium",
    "/api/fortune",
    "/api/haiku",
    "/api/roast",
    "/api/lucky-numbers",
    "/api/weather",
    "/api/railway",
    "/api/quote",
    "/api/joke",
    "/api/download",
  ],
  runtime: "nodejs",
}
