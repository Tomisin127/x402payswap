import { Attribution } from "ox/erc8021"
import type { Hex } from "viem"

/**
 * ERC-8021 transaction attribution.
 * ---------------------------------
 * We append a data suffix to the calldata of every `transferWithAuthorization`
 * tx our facilitator submits on Base. Indexers (base.dev, etc.) parse the
 * suffix backwards from the end of calldata to credit the listed `codes`.
 *
 * Docs: https://www.erc8021.com  |  https://oxlib.sh/ercs/erc8021
 *
 * Env vars:
 *   BASE_BUILDER_CODE — your Base Builder code, e.g. "bc_dh0rqw67".
 *                       If unset, we skip attribution and return "0x".
 *   ATTRIBUTION_EXTRA_CODES — optional comma-separated extra codes
 *                             (e.g. "morpho,uniswap") to co-attribute.
 */

export function getAttributionCodes(): string[] {
  const primary = process.env.BASE_BUILDER_CODE?.trim()
  const extras =
    process.env.ATTRIBUTION_EXTRA_CODES?.split(",")
      .map((c) => c.trim())
      .filter(Boolean) ?? []

  const codes: string[] = []
  if (primary) codes.push(primary)
  codes.push(...extras)
  return codes
}

/**
 * Build the ERC-8021 data suffix for the configured builder code(s).
 * Returns "0x" if no codes are configured (no-op append).
 */
export function buildAttributionSuffix(): Hex {
  const codes = getAttributionCodes()
  if (codes.length === 0) return "0x"

  // Schema 0 = canonical-registry schema. Perfect for short codes like "bc_...".
  // ox handles the encoding: [codes][codesLen][schemaId][0x8021...8021 marker]
  return Attribution.toDataSuffix({ codes }) as Hex
}

/**
 * Concatenate arbitrary calldata + the ERC-8021 suffix.
 * Safe when the suffix is empty — returns the original calldata unchanged.
 */
export function appendAttribution(calldata: Hex): Hex {
  const suffix = buildAttributionSuffix()
  if (suffix === "0x") return calldata
  // Strip the leading "0x" from the suffix before concatenating.
  return `${calldata}${suffix.slice(2)}` as Hex
}
