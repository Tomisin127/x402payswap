import { NextResponse } from "next/server"
import { settleExactEvmPayment, verifyExactEvmPayment } from "@/lib/facilitator-core"
import { parsePaymentPayload, type FacilitatorRequestBody, type SettleResponse } from "@/lib/x402"
import { getAttributionCodes } from "@/lib/attribution"

/**
 * POST /api/facilitator/settle
 * ----------------------------
 * Re-verifies the payload (defense in depth) and then submits
 * USDC.transferWithAuthorization on Base. Calldata is suffixed with the
 * ERC-8021 attribution data so every settlement earns builder-code credit.
 *
 * Gas for the settlement tx is paid by FACILITATOR_PRIVATE_KEY. The key needs
 * a small ETH balance on Base (~0.001 ETH is fine for thousands of settles).
 */
export async function POST(req: Request) {
  let body: FacilitatorRequestBody
  try {
    body = (await req.json()) as FacilitatorRequestBody
  } catch {
    return NextResponse.json<SettleResponse>(
      { success: false, errorReason: "Malformed JSON body" },
      { status: 400 },
    )
  }

  console.log("[v0] /settle incoming", {
    hasPaymentPayload: !!body.paymentPayload,
    hasPaymentHeader: !!body.paymentHeader,
    requirements: body.paymentRequirements
      ? {
          scheme: body.paymentRequirements.scheme,
          network: body.paymentRequirements.network,
          maxAmountRequired: body.paymentRequirements.maxAmountRequired,
        }
      : null,
  })

  try {
    const payload = parsePaymentPayload(body)
    const verification = await verifyExactEvmPayment(payload, body.paymentRequirements)
    if (!verification.ok) {
      console.log("[v0] /settle verify failed:", verification.reason)
      return NextResponse.json<SettleResponse>({
        success: false,
        errorReason: verification.reason,
        ...(verification.payer ? { payer: verification.payer } : {}),
      })
    }

    const txHash = await settleExactEvmPayment(
      verification.authorization,
      payload.payload.signature,
    )

    // Lightweight server-side breadcrumb so you can correlate txs → attribution.
    console.log("[v0] x402 settled", {
      tx: txHash,
      payer: verification.payer,
      codes: getAttributionCodes(),
      amount: verification.authorization.value,
    })

    return NextResponse.json<SettleResponse>({
      success: true,
      transaction: txHash,
      network: "base",
      payer: verification.payer,
    })
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown settle error"
    console.log("[v0] x402 settle error:", reason)
    return NextResponse.json<SettleResponse>({ success: false, errorReason: reason })
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
export const maxDuration = 60
