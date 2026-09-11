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
    expect(event.payloadHash).toMatch(/^[a-f0-9]{64}$/)
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

  it("applies the metadata allowlist during event normalization", () => {
    const event = normalizeAuditEvent({
      source: "admin",
      category: "operation",
      severity: "info",
      status: "success",
      action: "profile.publish",
      summary: "发布档案",
      metadata: { count: 1, unknownField: "discarded" },
    })
    expect(event.metadata).toEqual({ count: 1 })
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

  it("keeps payload hashes stable when metadata key order differs", () => {
    const first = normalizeAuditEvent({
      source: "server",
      category: "runtime",
      severity: "info",
      status: "success",
      action: "health.check",
      summary: "ok",
      metadata: { count: 1, durationMs: 2 },
      occurredAt: "2026-09-10T00:00:00.000Z",
    })
    const second = normalizeAuditEvent({
      source: "server",
      category: "runtime",
      severity: "info",
      status: "success",
      action: "health.check",
      summary: "ok",
      metadata: { durationMs: 2, count: 1 },
      occurredAt: "2026-09-10T00:00:00.000Z",
    })
    expect(first.payloadHash).toBe(second.payloadHash)
  })

  it("keeps only trusted SLS HTTPS links", () => {
    const trusted = normalizeAuditEvent({
      source: "server",
      category: "runtime",
      severity: "info",
      status: "success",
      action: "health.check",
      summary: "ok",
      externalLogUrl: "https://sls.console.aliyun.com/lognext/project/demo/logsearch",
    })
    const untrusted = normalizeAuditEvent({
      source: "server",
      category: "runtime",
      severity: "info",
      status: "success",
      action: "health.check",
      summary: "ok",
      externalLogUrl: "javascript:alert(1)",
    })
    expect(trusted.externalLogUrl).toContain("https://sls.console.aliyun.com/")
    expect(untrusted.externalLogUrl).toBeUndefined()
  })
})
