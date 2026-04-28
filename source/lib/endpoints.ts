/**
 * Single source of truth for every paid x402 endpoint in this dApp.
 * Consumed by:
 *   - middleware.ts          → to configure paymentMiddleware prices/network
 *   - app/api/discover/*     → to advertise the endpoints via a free JSON feed
 *   - components/endpoint-*  → to render the UI cards
 *
 * All prices are in USD; the facilitator converts to 6-decimal atomic USDC.
 */

export type IconKey =
  | "sparkles"
  | "cookie"
  | "feather"
  | "flame"
  | "dice"
  | "download"
  | "cloud"
  | "train"
  | "quote"
  | "smile"

export type PaidEndpointMeta = {
  /** HTTP path, e.g. "/api/fortune". */
  path: string
  /** Human-readable title for UI + discovery feed. */
  title: string
  /** One-sentence description shown to users and agents. */
  description: string
  /** Price string in the form "$0.01" — handed directly to x402-next. */
  price: string
  /** HTTP method to call. Currently all GET. */
  method: "GET"
  /**
   * Optional query params the endpoint accepts (for discovery clients / agents).
   * Name + type + whether required.
   */
  params?: Array<{ name: string; type: "string" | "number"; required: boolean; description: string }>
  /**
   * Icon key — maps to a lucide-react icon in the UI layer. Keeps this module
   * free of React imports so it can be used from the Node-runtime middleware.
   */
  icon: IconKey
  /** MIME type returned by the handler. */
  mimeType: "application/json"
  /** Max seconds the facilitator waits for settlement. */
  maxTimeoutSeconds: number
}

export const PAID_ENDPOINTS: PaidEndpointMeta[] = [
  {
    path: "/api/premium",
    title: "Premium alpha",
    description:
      "Curated on-chain alpha: yield venues, mempool anomalies, and replayable agent trade intents.",
    price: "$0.01",
    method: "GET",
    icon: "sparkles",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/fortune",
    title: "Fortune cookie",
    description: "A fresh fortune signed with today's on-chain entropy. Cracks open on payment.",
    price: "$0.01",
    method: "GET",
    icon: "cookie",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/haiku",
    title: "On-demand haiku",
    description: "A 5-7-5 haiku composed from seasonal fragments. Pass ?topic= to steer it.",
    price: "$0.01",
    method: "GET",
    icon: "feather",
    params: [
      {
        name: "topic",
        type: "string",
        required: false,
        description: "Optional topic word, e.g. 'onchain', 'moon', 'gasless'.",
      },
    ],
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/roast",
    title: "Playful roast",
    description: "A gentle, good-natured roast. Requires ?name= so we know who to roast.",
    price: "$0.01",
    method: "GET",
    icon: "flame",
    params: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "The target's first name. Keep it PG.",
      },
    ],
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/lucky-numbers",
    title: "Lucky numbers",
    description:
      "Six lucky numbers with a short interpretation. Seeded by Base block timing for flavor.",
    price: "$0.01",
    method: "GET",
    icon: "dice",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  // ---- Sub-cent endpoints — $0.001 each ---------------------------------
  {
    path: "/api/weather",
    title: "Live weather",
    description:
      "Real-time weather (temperature, wind, humidity) from Open-Meteo for any city worldwide.",
    price: "$0.001",
    method: "GET",
    icon: "cloud",
    params: [
      {
        name: "city",
        type: "string",
        required: true,
        description: "City name, e.g. 'Tokyo', 'Lagos', 'Buenos Aires'.",
      },
    ],
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/railway",
    title: "Railway timetable",
    description:
      "Next-three-departures snapshot between two stations. Pass ?from= and ?to= station codes.",
    price: "$0.001",
    method: "GET",
    icon: "train",
    params: [
      {
        name: "from",
        type: "string",
        required: true,
        description: "Origin station code or city, e.g. 'NYC' or 'London'.",
      },
      {
        name: "to",
        type: "string",
        required: true,
        description: "Destination station code or city.",
      },
    ],
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/quote",
    title: "Daily wisdom",
    description: "A short Stoic / contemplative quote with attribution. Refreshed on every call.",
    price: "$0.001",
    method: "GET",
    icon: "quote",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/joke",
    title: "Dad joke",
    description: "One groan-worthy, family-friendly joke. Optional ?category= to steer the punchline.",
    price: "$0.001",
    method: "GET",
    icon: "smile",
    params: [
      {
        name: "category",
        type: "string",
        required: false,
        description: "Optional topic, e.g. 'tech', 'food', 'crypto'.",
      },
    ],
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
  {
    path: "/api/download",
    title: "BrokenKeyRemapper software",
    description:
      "Unlocks a time-limited download link to the full BrokenKeyRemapper software build.",
    price: "$10.00",
    method: "GET",
    icon: "download",
    mimeType: "application/json",
    maxTimeoutSeconds: 60,
  },
]

/**
 * Build the routes map that x402-next's paymentMiddleware expects.
 * Keeping this co-located makes it impossible for the registry and the
 * middleware config to drift apart.
 */
export function buildMiddlewareRoutes(network: "base") {
  const entries = PAID_ENDPOINTS.map((e) => [
    e.path,
    {
      price: e.price,
      network,
      config: {
        description: `${e.title} — ${e.description}`,
        mimeType: e.mimeType,
        maxTimeoutSeconds: e.maxTimeoutSeconds,
      },
    },
  ])
  return Object.fromEntries(entries) as Record<
    string,
    {
      price: string
      network: "base"
      config: {
        description: string
        mimeType: "application/json"
        maxTimeoutSeconds: number
      }
    }
  >
}

/** List of exact paths — used by middleware's matcher. */
export const PAID_PATHS = PAID_ENDPOINTS.map((e) => e.path)

/**
 * Convert a USD price string like "$0.001" or "$10.00" to atomic USDC units
 * (USDC has 6 decimals on Base, so $1 = 1_000_000n).
 */
export function priceToAtomicUsdc(price: string): bigint {
  const cleaned = price.replace(/[$,]/g, "").trim()
  if (!/^\d+(\.\d+)?$/.test(cleaned)) {
    throw new Error(`Invalid price string: ${price}`)
  }
  const [whole = "0", frac = ""] = cleaned.split(".")
  const fracPadded = (frac + "000000").slice(0, 6)
  return BigInt(whole) * 1_000_000n + BigInt(fracPadded || "0")
}
