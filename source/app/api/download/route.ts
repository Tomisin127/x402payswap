import { NextResponse } from "next/server"
import { recordPaymentOnce, sha256Hex } from "@/lib/redis"

/**
 * Paid Route — $0.01
 * Returns a download link for the full Broken Key Remapper software build.
 * Reached ONLY after the x402 middleware has settled payment on Base mainnet.
 * Redis replay protection: each X-PAYMENT proof is single-use for 24h.
 */

// Google Drive file ID is extracted from the share URL the merchant provided.
// We rebuild it as a direct-download URL (`uc?export=download&id=...`) so the
// buyer gets the actual file instead of the Drive preview page.
const DRIVE_FILE_ID = "1dCFyioeR_ST0OF1gZZzPXGn82U7Q-Vvp"
const DOWNLOAD_LINK = `https://drive.google.com/uc?export=download&id=${DRIVE_FILE_ID}`

export async function GET(request: Request) {
  const paymentHeader = request.headers.get("x-payment")
  if (paymentHeader) {
    const key = await sha256Hex(paymentHeader)
    const firstUse = await recordPaymentOnce(key)
    if (!firstUse) {
      return NextResponse.json(
        { error: "Replay detected", message: "This payment proof was already used." },
        { status: 409 },
      )
    }
  }

  const response = NextResponse.json({
    unlockedAt: new Date().toISOString(),
    success: true,
    message: "Thank you for your purchase!",
    product: "Broken Key Remapper",
    version: "1.2",
    downloadLink: DOWNLOAD_LINK,
    mirror: `https://drive.google.com/file/d/${DRIVE_FILE_ID}/view`,
    expiresIn: "24 hours",
    instructions:
      "Click the download link to save the archive. Extract and run BrokenKeyRemapper.exe (Windows) or the equivalent for your OS.",
    note: "One-time purchase per download. Contact support if you have any issues.",
  })

  const settlementResponse = request.headers.get("x-payment-response")
  if (settlementResponse) response.headers.set("x-payment-response", settlementResponse)
  return response
}
