/**
 * Stable hashing for AIM runs.
 *
 * - promptHash: SHA-256 of the final composed prompt text. This is the *real*
 *   version of what was sent to the model — we never rely on hand-maintained
 *   version numbers.
 * - contextHash: SHA-256 of the context manifest (source ids + updatedAt +
 *   charCount + actual content hashes). Two runs that load the same sources in the same state produce
 *   the same hash, enabling deterministic replay.
 *
 * The hash is computed over a canonical, stable string form so it is identical
 * across processes and replays.
 */

import { createHash } from "node:crypto"
import type { AimContextSource } from "./types"

export function sha256(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

/** Hash the final composed prompt. */
export function hashPrompt(prompt: string): string {
  // Normalize trailing whitespace so cosmetic diffs don't change the version.
  return sha256(prompt.replace(/\s+$/g, ""))
}

/** Hash an image by content (for the snapshot's imageHashes; no base64 stored). */
export function hashImageBytes(bytes: Buffer | Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex")
}

/**
 * Hash the context manifest. Stable ordering: sources are sorted by
 * (kind, id) before hashing so order-independent loads match.
 */
export function hashContextManifest(sources: readonly AimContextSource[]): string {
  const canonical = [...sources]
    .sort((a, b) =>
      a.kind === b.kind ? a.id.localeCompare(b.id) : a.kind.localeCompare(b.kind)
    )
    .map((source) => `${source.kind}|${source.id}|${source.updatedAt ?? ""}|${source.charCount}|${source.contentHash ?? ""}`)
    .join("\n")
  return sha256(canonical)
}
