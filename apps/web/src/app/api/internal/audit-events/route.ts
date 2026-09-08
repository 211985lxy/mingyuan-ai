import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { recordAuditEvent } from "@/lib/audit-events"
import { verifyAuditSignature } from "@/lib/audit-ingest"

export const runtime = "nodejs"
// api-inventory: auth=signed_integration
// api-inventory: input=raw_body

const MAX_BODY_BYTES = 64 * 1024
const EXTERNAL_AUDIT_SOURCES = new Set(["repo_agent", "server"])

class AuditBodyTooLargeError extends Error {}

async function readBoundedBody(request: NextRequest): Promise<string> {
  const contentLength = Number(request.headers.get("content-length"))
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    throw new AuditBodyTooLargeError()
  }

  if (!request.body) return ""
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  const chunks: string[] = []
  let totalBytes = 0

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      totalBytes += value.byteLength
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel()
        throw new AuditBodyTooLargeError()
      }
      chunks.push(decoder.decode(value, { stream: true }))
    }
  } finally {
    reader.releaseLock()
  }

  chunks.push(decoder.decode())
  return chunks.join("")
}

export async function POST(request: NextRequest) {
  const secret = env.AUDIT_INGEST_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Audit ingestion is not configured" }, { status: 503 })
  }

  let body: string
  try {
    body = await readBoundedBody(request)
  } catch (error) {
    if (!(error instanceof AuditBodyTooLargeError)) throw error
    return NextResponse.json({ error: "Audit event is too large" }, { status: 413 })
  }

  const timestamp = Number(request.headers.get("x-audit-timestamp"))
  const signature = request.headers.get("x-audit-signature") || ""
  if (!verifyAuditSignature(body, timestamp, signature, secret)) {
    return NextResponse.json({ error: "Invalid audit signature" }, { status: 401 })
  }

  let payload: unknown
  try {
    payload = JSON.parse(body)
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 })
  }

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return NextResponse.json({ error: "Audit event must be an object" }, { status: 400 })
  }
  const event = payload as Record<string, unknown>
  if (typeof event.source !== "string" || !EXTERNAL_AUDIT_SOURCES.has(event.source)) {
    return NextResponse.json({ error: "Audit event source is not allowed" }, { status: 400 })
  }
  if (
    typeof event.idempotencyKey !== "string"
    || !event.idempotencyKey.trim()
    || event.idempotencyKey.length > 191
  ) {
    return NextResponse.json({ error: "Audit event idempotencyKey is required" }, { status: 400 })
  }

  try {
    const result = await recordAuditEvent(event as never, { strict: true })
    return NextResponse.json({ data: result }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit event rejected" },
      { status: 400 },
    )
  }
}
