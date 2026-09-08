import { describe, expect, it } from "vitest"
import {
  buildAuditSignature,
  verifyAuditSignature,
} from "@/lib/audit-ingest"

describe("signed audit ingestion", () => {
  const secret = "audit-ingest-test-secret-with-at-least-32-bytes"
  const body = JSON.stringify({ source: "server", action: "health.check" })
  const timestamp = 1_800_000_000

  it("accepts a valid HMAC signature", () => {
    const signature = buildAuditSignature(body, timestamp, secret)
    expect(verifyAuditSignature(body, timestamp, signature, secret, timestamp)).toBe(true)
  })

  it("rejects a changed body, wrong secret, and stale timestamp", () => {
    const signature = buildAuditSignature(body, timestamp, secret)
    expect(verifyAuditSignature(`${body}x`, timestamp, signature, secret, timestamp)).toBe(false)
    expect(verifyAuditSignature(body, timestamp, signature, "wrong-secret", timestamp)).toBe(false)
    expect(verifyAuditSignature(body, timestamp, signature, secret, timestamp + 301)).toBe(false)
  })

  it("rejects malformed timestamps and signatures", () => {
    expect(verifyAuditSignature(body, Number.NaN, "x", secret, timestamp)).toBe(false)
    expect(verifyAuditSignature(body, timestamp, "x", secret, timestamp)).toBe(false)
  })
})
