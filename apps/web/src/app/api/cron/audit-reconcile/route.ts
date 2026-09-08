import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { reconcileAuditEvents } from "@/lib/audit-events"

export const runtime = "nodejs"
export const maxDuration = 60

export async function POST(request: NextRequest) {
  if (!validateCronSecret(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const searchParams = new URL(request.url).searchParams
  const rawLimit = Number(searchParams.get("limit") || "100")
  try {
    const result = await reconcileAuditEvents(Number.isFinite(rawLimit) ? rawLimit : 100, searchParams.get("cursor") || undefined)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid audit reconciliation request" }, { status: 400 })
  }
}

export async function GET(request: NextRequest) {
  return POST(request)
}
