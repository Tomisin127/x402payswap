import { NextResponse } from "next/server"
import { verifyExactEvmPayment } from "@/lib/facilitator-core"
import { parsePaymentPayload, type FacilitatorRequestBody, type VerifyResponse } from "@/lib/x402"

/**
 * POST /api/facilitator/verify
 * ----------------------------
 * Pure verification — no on-chain writes. Confirms the client's signed
 * EIP-3009 authorization is well-formed, in-date, correctly signed, and that
 * the payer has enough USDC on Base to cover the amount. Nonce is also
 * checked against USDC.authorizationState so we never approve a replay.
 */
export async function POST(req: Request) {
  let body: FacilitatorRequestBody
  try {
    body = (await req.json()) as FacilitatorRequestBody
  } catch {
    console.log("[v0] /verify malformed JSON")
    return NextResponse.json<VerifyResponse>(
      { isValid: false, invalidReason: "Malformed JSON body" },
      { status: 400 },
    )
  }

  console.log("[v0] /verify incoming", {
    hasPaymentPayload: !!body.paymentPayload,
    hasPaymentHeader: !!body.paymentHeader,
    requirements: body.paymentRequirements
      ? {
          scheme: body.paymentRequirements.scheme,
          network: body.paymentRequirements.network,
          maxAmountRequired: body.paymentRequirements.maxAmountRequired,
          payTo: body.paymentRequirements.payTo,
          asset: body.paymentRequirements.asset,
        }
      : null,
  })

  try {
    const payload = parsePaymentPayload(body)
    const result = await verifyExactEvmPayment(payload, body.paymentRequirements)

    if (!result.ok) {
      console.log("[v0] /verify invalid:", result.reason, "payer:", result.payer)
      return NextResponse.json<VerifyResponse>({
        isValid: false,
        invalidReason: result.reason,
        ...(result.payer ? { payer: result.payer } : {}),
      })
    }

    console.log("[v0] /verify ok, payer:", result.payer)
    return NextResponse.json<VerifyResponse>({ isValid: true, payer: result.payer })
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Unknown verify error"
    console.log("[v0] /verify threw:", reason)
    return NextResponse.json<VerifyResponse>({ isValid: false, invalidReason: reason })
  }
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"
