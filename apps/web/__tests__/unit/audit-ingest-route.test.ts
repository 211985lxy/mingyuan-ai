import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { recordAuditEvent } = vi.hoisted(() => ({
  recordAuditEvent: vi.fn(async () => ({ ok: true, inserted: true, id: "event-1" })),
}))

vi.mock("@/env", () => ({
  env: { AUDIT_INGEST_SECRET: "audit-ingest-test-secret-with-at-least-32-bytes" },
}))
vi.mock("@/lib/audit-events", () => ({ recordAuditEvent }))

import { buildAuditSignature } from "@/lib/audit-ingest"
import { POST } from "@/app/api/internal/audit-events/route"

const secret = "audit-ingest-test-secret-with-at-least-32-bytes"

function signedRequest(payload: Record<string, unknown>) {
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  return new NextRequest("http://localhost/api/internal/audit-events", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-audit-timestamp": String(timestamp),
      "x-audit-signature": buildAuditSignature(body, timestamp, secret),
    },
    body,
  })
}

function validPayload(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    source: "repo_agent",
    category: "repository_change",
    severity: "info",
    status: "success",
    action: "git.commit",
    summary: "Repository commit confirmed",
    idempotencyKey: "repo_agent:git.commit:corr-1:sha-1",
    ...overrides,
  }
}

describe("audit ingestion route", () => {
  beforeEach(() => recordAuditEvent.mockClear())

  it("rejects signed events without a stable idempotency key", async () => {
    const payload = validPayload()
    delete payload.idempotencyKey

    const response = await POST(signedRequest(payload))

    expect(response.status).toBe(400)
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it("rejects external producers that claim an in-process source", async () => {
    const response = await POST(signedRequest(validPayload({ source: "admin" })))

    expect(response.status).toBe(400)
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })

  it("stops reading a streamed body as soon as it crosses 64 KiB", async () => {
    let pulls = 0
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1
        controller.enqueue(new Uint8Array(40 * 1024))
        if (pulls === 4) controller.close()
      },
    })
    const request = new NextRequest("http://localhost/api/internal/audit-events", {
      method: "POST",
      body,
      duplex: "half",
    } as never)

    const response = await POST(request)

    expect(response.status).toBe(413)
    expect(pulls).toBeLessThan(4)
    expect(recordAuditEvent).not.toHaveBeenCalled()
  })
})
