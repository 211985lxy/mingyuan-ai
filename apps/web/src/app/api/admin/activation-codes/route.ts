import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const url = new URL(request.url)
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1"))
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "20")))
  const status = url.searchParams.get("status") || ""
  const batchId = url.searchParams.get("batchId") || ""

  const where: Record<string, unknown> = {}

  if (status && ["unused", "used"].includes(status)) {
    where.status = status
  }

  if (batchId) {
    where.batchId = batchId
  }

  const [results, total, batchesRaw] = await Promise.all([
    prisma.activationCode.findMany({
      where,
      select: {
        id: true,
        code: true,
        batchId: true,
        batchNote: true,
        durationDays: true,
        status: true,
        usedAt: true,
        createdAt: true,
        user: {
          select: { email: true, name: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.activationCode.count({ where }),
    prisma.activationCode.groupBy({
      by: ["batchId"],
      orderBy: { batchId: "desc" },
    }),
  ])

  const batches = batchesRaw.map((b) => b.batchId)

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "activation_codes.read",
    targetType: "activation_code_list",
    metadata: { page, pageSize, status: status || null, batchId: batchId || null, resultCount: results.length },
  })

  return NextResponse.json(
    { data: { results, total, page, pageSize, batches } },
    { headers: { "x-request-id": requestId } },
  )
})
