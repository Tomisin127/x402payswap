import { paymentMiddleware } from "x402-next"
import { facilitator as cdpFacilitator } from "@coinbase/x402"
import { NextResponse, type NextRequest } from "next/server"
import { buildMiddlewareRoutes } from "@/lib/endpoints"

/**
 * x402 Payment Middleware — settled by the Coinbase CDP facilitator.
 * ------------------------------------------------------------------
 * Every paid endpoint listed in `lib/endpoints.ts` returns `402 Payment
 * Required` with a JSON body describing the accepted USDC payment on Base.
 * The client (`lib/pay-client.ts` -> `x402-fetch`) signs an EIP-3009
 * `transferWithAuthorization` and retries with an `X-PAYMENT` header.
 *
 * The CDP facilitator (https://api.cdp.coinbase.com/platform/v2/x402)
 * verifies the signature, settles the USDC transfer on Base mainnet, and
 * returns the settlement details in the `X-PAYMENT-RESPONSE` header.
 *
 * IMPORTANT: USDC's on-chain `transferWithAuthorization` validates the
 * signature with `ecrecover`, so it ONLY accepts EOA / ECDSA signatures.
 * Coinbase Smart Wallet and Base App use ERC-1271 / ERC-6492 wrapped
 * signatures, which CDP rejects with `invalid_payload`. The UI guides
 * those users to use an EOA wallet instead.
 *
 * Required env vars:
 *   - PAY_TO_ADDRESS       Your receiving wallet on Base (0x...).
 *   - CDP_API_KEY_ID       From portal.cdp.coinbase.com
 *   - CDP_API_KEY_SECRET   From portal.cdp.coinbase.com
 */

const payTo = (process.env.PAY_TO_ADDRESS ??
  "0xc0887adf2411c4db859e497c1f931c59600b1ec4") as `0x${string}`

const routes = buildMiddlewareRoutes("base")

/**
 * Wrap the CDP facilitator so JWT-generation errors are logged with full
 * detail (instead of swallowing a stack trace into a 500). We still
 * re-throw — the outer middleware wrapper below catches and converts the
 * throw into a clean 402 with a usable error message.
 */
const facilitator = {
  url: cdpFacilitator.url,
  createAuthHeaders: async () => {
    try {
      const headers = await cdpFacilitator.createAuthHeaders()
      return headers
    } catch (err) {
      console.error(
        "[v0] CDP createAuthHeaders failed — verify CDP_API_KEY_ID and CDP_API_KEY_SECRET are correct and the project is enabled for x402.",
        err,
      )
      throw err
    }
  },
}

const handler = paymentMiddleware(
  payTo,
  routes,
  facilitator as Parameters<typeof paymentMiddleware>[2],
)

console.log(
  "[v0] x402 middleware loaded via CDP facilitator. payTo:",
  payTo,
  "routes:",
  Object.keys(routes),
)

/**
 * Top-level error boundary for x402 middleware.
 * ----------------------------------------------
 * If the inner `paymentMiddleware` throws (e.g. CDP returns a non-JSON
 * body, JWT generation fails, network error to CDP, etc.) Next.js would
 * normally serve a 500 with no useful body and the client sees only
 * "Request failed with 500". We catch the throw here and return a proper
 * `402 Payment Required` JSON response carrying the actual error string,
 * so `pay-client` / `swap-panel` can surface it to the user.
 */
export async function middleware(req: NextRequest) {
  try {
    return await handler(req)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown facilitator error"
    console.error("[v0] x402 middleware crashed for", req.nextUrl.pathname, ":", err)
    return new NextResponse(
      JSON.stringify({
        x402Version: 1,
        error: `Payment facilitator unavailable: ${message}. Please retry, or try a different wallet.`,
      }),
      {
        status: 402,
        headers: { "Content-Type": "application/json" },
      },
    )
  }
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
