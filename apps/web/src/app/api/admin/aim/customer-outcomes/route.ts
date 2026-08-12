import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@/generated/prisma/client"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { parseJsonRecord } from "@/lib/api-contract"
import {
  generateCustomerOutcomeCaseCandidate,
} from "@/lib/aim/customer-outcome-case-store"
import {
  createPrismaCustomerOutcomeProjectionStore,
} from "@/lib/aim/customer-outcome-prisma"
import {
  loadCustomerOutcomeSource,
  readCustomerOutcomeSyncConfig,
  syncCustomerOutcomeProjections,
} from "@/lib/aim/customer-outcome-sync"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

function limit(value: string | null): number {
  const parsed = Number(value ?? 50)
  if (!Number.isFinite(parsed) || parsed < 1) return 50
  return Math.min(Math.floor(parsed), 100)
}

export const GET = withAdminOnly(async (request: NextRequest) => {
  const url = new URL(request.url)
  const projectId = url.searchParams.get("projectId")?.trim()
  const reviewStatus = url.searchParams.get("reviewStatus")?.trim()
  const items = await prisma.customerOutcomeProjection.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(reviewStatus ? { reviewStatus } : {}),
    },
    orderBy: [{ observedTo: "desc" }, { id: "desc" }],
    take: limit(url.searchParams.get("limit")),
  })
  return NextResponse.json({ items })
})

async function generateApprovedCaseCandidates(
  projectionId: string,
): Promise<{ result: Record<string, unknown>; targetId: string }> {
  const rows = projectionId
    ? [{ id: projectionId }]
    : await prisma.customerOutcomeProjection.findMany({
      where: { reviewStatus: "approved" },
      select: { id: true },
      orderBy: { reviewedAt: "asc" },
      take: 100,
    })
  const generated = []
  for (const row of rows) {
    generated.push({
      customerOutcomeProjectionId: row.id,
      ...await generateCustomerOutcomeCaseCandidate({
        customerOutcomeProjectionId: row.id,
      }),
    })
  }
  return {
    result: {
      total: generated.length,
      created: generated.filter((row) => row.ok && row.created).length,
      blocked: generated.filter((row) => !row.ok).length,
      items: generated,
    },
    targetId: projectionId || "approved_batch",
  }
}

async function loadOrSyncCustomerOutcomes(mode: "verify" | "sync") {
  const config = readCustomerOutcomeSyncConfig()
  const snapshot = await loadCustomerOutcomeSource({ config })
  if (mode === "verify") {
    return {
      verifyResponse: {
        mode,
        fieldCount: snapshot.fields.length,
        recordCount: snapshot.records.length,
        observedFieldTypes: Object.fromEntries(
          snapshot.fields.map((field) => [field.name, field.type]),
        ),
      },
      targetId: config.tableId,
    }
  }
  const result = await syncCustomerOutcomeProjections({
    snapshot,
    tableId: config.tableId,
    db: prisma,
    store: createPrismaCustomerOutcomeProjectionStore(),
  })
  return { result, targetId: config.tableId }
}

export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  let body: Record<string, unknown>
  try {
    body = await parseJsonRecord(request)
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 })
  }
  const mode =
    body.mode === "verify"
    || body.mode === "sync"
    || body.mode === "generate_candidates"
      ? body.mode
      : null
  if (!mode) {
    return NextResponse.json({
      error: "mode 必须是 verify、sync 或 generate_candidates",
    }, { status: 400 })
  }
  try {
    const operation = mode === "generate_candidates"
      ? await generateApprovedCaseCandidates(
        typeof body.customerOutcomeProjectionId === "string"
          ? body.customerOutcomeProjectionId.trim()
          : "",
      )
      : await loadOrSyncCustomerOutcomes(mode)
    if ("verifyResponse" in operation) {
      return NextResponse.json(operation.verifyResponse)
    }
    const { result, targetId } = operation
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: `customer_outcome.${mode}`,
      targetType: "customer_outcome_projection",
      targetId,
      metadata: JSON.parse(JSON.stringify(result)) as Prisma.InputJsonValue,
    })
    return NextResponse.json(
      { mode, result },
      { headers: { "x-request-id": requestId } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "客户结果处理失败" },
      { status: 409 },
    )
  }
})
