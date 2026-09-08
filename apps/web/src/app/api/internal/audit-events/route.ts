import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { recordAuditEvent } from "@/lib/audit-events"
import { verifyAuditSignature } from "@/lib/audit-ingest"

export const runtime = "nodejs"

const MAX_BODY_BYTES = 64 * 1024

export async function POST(request: NextRequest) {
  const secret = env.AUDIT_INGEST_SECRET
  if (!secret || secret.length < 32) {
    return NextResponse.json({ error: "Audit ingestion is not configured" }, { status: 503 })
  }

  const body = await request.text()
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
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

  try {
    const result = await recordAuditEvent(payload as never, { strict: true })
    return NextResponse.json({ data: result }, { status: 202 })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Audit event rejected" },
      { status: 400 },
    )
  }
}
