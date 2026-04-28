import { paymentMiddleware } from "x402-next"
import { facilitator } from "@coinbase/x402"
import { buildMiddlewareRoutes } from "@/lib/endpoints"

/**
 * x402 Payment Middleware — settled by the Coinbase CDP facilitator.
 * ------------------------------------------------------------------
 * Every paid endpoint listed in `lib/endpoints.ts` returns `402 Payment
 * Required` with a JSON body describing the accepted USDC payment on Base.
 * The client (`lib/pay-client.ts` -> `x402-fetch`) signs an EIP-3009
 * `transferWithAuthorization` and retries with an `X-PAYMENT` header.
 *
 * The Coinbase CDP facilitator verifies the signature (EOA, ERC-1271
 * smart-wallet, and ERC-6492 counterfactual signatures are all supported)
 * and settles the USDC transfer on Base mainnet, then returns the
 * settlement details in the `X-PAYMENT-RESPONSE` header.
 *
 * Required env vars:
 *   - PAY_TO_ADDRESS       Your receiving wallet on Base (0x...).
 *   - CDP_API_KEY_ID       From portal.cdp.coinbase.com
 *   - CDP_API_KEY_SECRET   From portal.cdp.coinbase.com
 */

const payTo = (process.env.PAY_TO_ADDRESS ??
  "0xc0887adf2411c4db859e497c1f931c59600b1ec4") as `0x${string}`

const routes = buildMiddlewareRoutes("base")

export const middleware = paymentMiddleware(payTo, routes, facilitator)

console.log(
  "[v0] x402 middleware loaded via CDP facilitator. payTo:",
  payTo,
  "routes:",
  Object.keys(routes),
)

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
