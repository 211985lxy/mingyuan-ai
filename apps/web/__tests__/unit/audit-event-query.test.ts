import { describe, expect, it } from "vitest"

import { auditEventCursor, encodeAuditEventCursor, parseAuditEventQuery } from "@/lib/audit-event-query"

describe("audit event query contract", () => {
  it("supports a bounded range and shared filters", () => {
    const parsed = parseAuditEventQuery(new URLSearchParams({
      from: "2026-09-01",
      to: "2026-09-07",
      source: "aim",
      severity: "error",
      action: "generate",
    }))
    expect("error" in parsed).toBe(false)
    if ("error" in parsed) return
    expect(parsed.filters.range.from).toBe("2026-09-01")
    expect(parsed.where).toEqual(expect.objectContaining({ source: "aim", severity: "error", action: { contains: "generate" } }))
  })

  it("round-trips tuple cursors and accepts legacy ids", () => {
    const encoded = encodeAuditEventCursor({ id: "evt-1", occurredAt: new Date("2026-09-10T00:00:00.000Z") })
    expect(auditEventCursor(encoded)).toEqual({ id: "evt-1", occurredAt: new Date("2026-09-10T00:00:00.000Z") })
    expect(auditEventCursor("evt-legacy")).toEqual({ id: "evt-legacy" })
  })

  it("rejects an invalid cursor", () => {
    expect(() => auditEventCursor("%%%bad%%%"))
      .toThrow("cursor 无效")
  })
})
