import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  loadBusinessAttributionSource,
  readBusinessAttributionSyncConfig,
  syncBusinessAttributions,
} from "@/lib/aim/business-attribution-sync"
import { createPrismaOutcomeAttributionStore } from "@/lib/aim/outcome-attribution-prisma"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function parseLimit(value: string | null): number {
  const parsed = Number(value ?? 50)
  if (!Number.isFinite(parsed) || parsed < 1) return 50
  return Math.min(Math.floor(parsed), 100)
}

export const GET = withAdminAuth(async (request: NextRequest) => {
  const url = new URL(request.url)
  const generationId = url.searchParams.get("generationId")?.trim()
  const userId = url.searchParams.get("userId")?.trim()
  const attributionMethod = url.searchParams.get("attributionMethod")?.trim()
  const where: Record<string, unknown> = {}
  if (generationId) where.generationId = generationId
  if (userId) where.userId = userId
  if (attributionMethod) where.attributionMethod = attributionMethod
  const items = await prisma.outcomeAttribution.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: parseLimit(url.searchParams.get("limit")),
  })
  return NextResponse.json({ items })
}, "admin")

export const POST = withAdminAuth(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const mode = body.mode === "sync" ? "sync" : body.mode === "verify" ? "verify" : null
  if (!mode) {
    return NextResponse.json({ error: "mode 必须是 verify 或 sync" }, { status: 400 })
  }
  try {
    const config = readBusinessAttributionSyncConfig()
    const snapshot = await loadBusinessAttributionSource({ config })
    if (mode === "verify") {
      return NextResponse.json({
        mode,
        fieldCount: snapshot.fields.length,
        recordCount: snapshot.records.length,
        observedFieldTypes: Object.fromEntries(
          snapshot.fields.map((field) => [field.name, field.type]),
        ),
      })
    }
    const result = await syncBusinessAttributions({
      snapshot,
      tableId: config.tableId,
      db: prisma,
      store: createPrismaOutcomeAttributionStore(),
    })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "outcome_attribution.sync",
      targetType: "outcome_attribution",
      targetId: config.tableId,
      metadata: {
        sourceRecords: result.sourceRecords,
        created: result.created,
        updated: result.updated,
        skipped: result.skipped,
        conflicts: result.conflicts,
        observedFieldTypes: result.observedFieldTypes,
        errors: result.errors,
      },
    })
    return NextResponse.json(
      { mode, result },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "经营归因同步失败" },
      { status: 409 },
    )
  }
}, "admin")
