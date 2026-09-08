import { describe, expect, it } from "vitest"
import {
  buildAuditIdempotencyKey,
  normalizeAuditEvent,
  redactAuditValue,
} from "@/lib/audit-event-contract"

describe("audit event contract", () => {
  it("normalizes a valid event and supplies safe defaults", () => {
    const event = normalizeAuditEvent({
      source: "admin",
      category: "operation",
      severity: "info",
      status: "success",
      action: "profile.publish",
      summary: "发布档案",
      actorType: "admin",
      actorId: "admin-1",
      metadata: { targetCount: 2 },
    })

    expect(event.source).toBe("admin")
    expect(event.actorIdHash).toHaveLength(16)
    expect(event.correlationId).toBeTruthy()
    expect(event.metadata).toEqual({ targetCount: 2 })
  })

  it("removes sensitive keys and truncates untrusted strings", () => {
    const value = redactAuditValue({
      token: "secret",
      Authorization: "Bearer secret",
      prompt: "private prompt",
      nested: { email: "person@example.com", ok: "yes" },
      long: "x".repeat(3000),
    })

    expect(value).toEqual({ nested: { ok: "yes" }, long: `${"x".repeat(1997)}...` })
  })

  it("builds a stable idempotency key", () => {
    const a = buildAuditIdempotencyKey("admin", "AdminAuditLog", "audit-1")
    const b = buildAuditIdempotencyKey("admin", "AdminAuditLog", "audit-1")
    expect(a).toBe(b)
    expect(a).toMatch(/^admin:AdminAuditLog:audit-1$/)
  })

  it("rejects unsupported enum values and oversized summaries", () => {
    expect(() => normalizeAuditEvent({
      source: "nope" as never,
      category: "operation",
      severity: "info",
      status: "success",
      action: "x",
      summary: "x",
    })).toThrow("Invalid audit event source")

    expect(() => normalizeAuditEvent({
      source: "admin",
      category: "operation",
      severity: "info",
      status: "success",
      action: "x",
      summary: "x".repeat(5001),
    })).toThrow("Audit summary is too long")
  })
})
