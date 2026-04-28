# x402 Demo — Pay-per-request APIs on Base

A Next.js 16 dApp that demonstrates the [x402](https://www.x402.org) HTTP payments protocol on **Base mainnet**, settled through the official **Coinbase CDP facilitator**. Five paid endpoints, each **0.01 USDC**, plus a free discovery feed that advertises them to humans and agents.

## What's inside

- **`middleware.ts`** — `paymentMiddleware` from `x402-next` + `facilitator` from `@coinbase/x402`. Protects every path in the registry.
- **`lib/endpoints.ts`** — single source of truth for paid endpoints. Feeds both the middleware config and the discovery feed so they can't drift.
- **`app/api/discover/route.ts`** — free `GET /api/discover` manifest listing every paid endpoint with price, method, params, and docs. Cache-friendly, no payment required.
- **`app/api/premium/route.ts`** — gated on-chain alpha JSON.
- **`app/api/fortune/route.ts`** — gated fortune cookie message.
- **`app/api/haiku/route.ts`** — gated 5-7-5 haiku, optional `?topic=`.
- **`app/api/roast/route.ts`** — gated good-natured roast, required `?name=`.
- **`app/api/lucky-numbers/route.ts`** — gated lucky numbers + interpretation.
- **`app/api/free-joke/route.ts`** — free endpoint for contrast.
- **`lib/pay-client.ts`** — hand-rolled 402 → sign → retry flow on top of `viem`. Unlike `x402-fetch`, it parses 402 bodies as text first so HTML error pages surface a useful message instead of `Unexpected token '<'`.
- **`lib/redis.ts`** — Upstash Redis client + 24h replay-protection for each `X-PAYMENT` proof.
- **`components/endpoint-card.tsx`** — generic card that drives the payment flow for any endpoint in the registry.
- **`components/discovery-panel.tsx`** — SWR-backed UI that reads `/api/discover` and shows the manifest.

## Optional: self-hosted facilitator with ERC-8021 attribution

The repo also ships a complete self-hosted facilitator under `app/api/facilitator/*` with matching `lib/facilitator-core.ts`, `lib/attribution.ts`, and `lib/usdc.ts`. It appends your `ox/erc8021` Base builder code suffix to every settlement tx's calldata for on-chain attribution.

It's **not wired into the middleware by default** — `middleware.ts` imports `facilitator` from `@coinbase/x402`. To switch over, change those two lines:

```ts
// middleware.ts
// -import { facilitator } from "@coinbase/x402"
// +const facilitator = { url: `${resolveAppUrl()}/api/facilitator` }
```

Then set `FACILITATOR_PRIVATE_KEY` (EOA with a little ETH on Base for gas) and `BASE_BUILDER_CODE`. See `app/api/facilitator/supported/route.ts`, `.../verify/route.ts`, and `.../settle/route.ts` for the wire format.

## 1. Get Coinbase CDP API keys

1. Go to [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com/).
2. Create a new API key pair.
3. Copy the **Key ID** and **Secret** into `CDP_API_KEY_ID` and `CDP_API_KEY_SECRET`. `@coinbase/x402` reads them from env automatically.

## 2. Set your receiving wallet

Put the Base mainnet address that should receive the USDC payments in `PAY_TO_ADDRESS`. Any EOA or smart wallet on Base works.

## 3. Configure environment variables

Copy `.env.example` to `.env.local` and fill in:

```bash
PAY_TO_ADDRESS=0x...
CDP_API_KEY_ID=...
CDP_API_KEY_SECRET=...
KV_REST_API_URL=...     # from Upstash integration
KV_REST_API_TOKEN=...   # from Upstash integration
```

## 4. Run locally

```bash
pnpm install
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000), click **Connect wallet**, then click any **Pay 0.01 USDC** button. Your wallet will pop up to sign a USDC transfer authorization. Once settled, the JSON response appears below the card.

> Heads up: this demo charges **real 0.01 USDC on Base mainnet** (roughly one cent per call).

## 5. Discovery feed

Any HTTP client can enumerate the paid API surface by calling the free discovery endpoint:

```bash
curl https://your-app.vercel.app/api/discover
```

Response shape:

```json
{
  "x402Version": 1,
  "network": "base",
  "asset": "USDC",
  "endpoints": [
    {
      "path": "/api/premium",
      "url": "https://your-app.vercel.app/api/premium",
      "title": "Premium alpha",
      "description": "Curated on-chain alpha…",
      "method": "GET",
      "price": "$0.01",
      "mimeType": "application/json",
      "maxTimeoutSeconds": 60,
      "params": []
    }
    // …
  ]
}
```

Agents can read this once, pick an endpoint, and start paying.

## 6. Deploy to Vercel

1. Push to GitHub.
2. Import at [vercel.com/new](https://vercel.com/new).
3. Add `PAY_TO_ADDRESS`, `CDP_API_KEY_ID`, `CDP_API_KEY_SECRET`.
4. Add the **Upstash for Redis** integration — it injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`.
5. Deploy.

## Customization

### Change the price

Edit the relevant entry in `lib/endpoints.ts`:

```ts
{
  path: "/api/premium",
  price: "$0.10", // or "$1.00", "$25.00"
  // …
}
```

Both the middleware and the discovery feed pick up the new price on next deploy.

### Add a new paid endpoint

1. Add a new `{ path, title, description, price, method, icon, mimeType, maxTimeoutSeconds }` entry to `PAID_ENDPOINTS` in `lib/endpoints.ts`.
2. Create `app/api/<your-path>/route.ts` with the handler.
3. Done. The middleware's matcher and the discovery feed are both derived from `PAID_ENDPOINTS`, and the UI renders a card automatically.

### Serve a file download instead of JSON

Inside any paid route, replace the JSON response with a binary one:

```ts
const file = await fetch("https://your-bucket/my-file.zip")
return new Response(file.body, {
  headers: {
    "Content-Type": "application/zip",
    "Content-Disposition": 'attachment; filename="my-file.zip"',
  },
})
```

### Call from an AI agent / script

Any HTTP client that understands 402 can pay. Example with `x402-fetch` and a private key:

```ts
import { privateKeyToAccount } from "viem/accounts"
import { createWalletClient, http } from "viem"
import { base } from "viem/chains"
import { wrapFetchWithPayment } from "x402-fetch"

const account = privateKeyToAccount(process.env.AGENT_PRIVATE_KEY as `0x${string}`)
const client = createWalletClient({ account, chain: base, transport: http() })

const fetchWithPay = wrapFetchWithPayment(fetch, client)
const res = await fetchWithPay("https://your-app.vercel.app/api/haiku?topic=onchain")
console.log(await res.json())
```

## Replay protection

The CDP facilitator already prevents replays via signed nonces. This app adds a second layer: every `X-PAYMENT` header is SHA-256 hashed and stored in Upstash Redis with a 24-hour TTL. A replayed payload gets **409 Conflict** instead of the gated response.

## Resources

- x402 spec & docs — [x402.org](https://www.x402.org)
- Coinbase CDP Portal — [portal.cdp.coinbase.com](https://portal.cdp.coinbase.com)
- Base — [base.org](https://base.org)
- ERC-8021 attribution — [erc8021.com](https://www.erc8021.com)
