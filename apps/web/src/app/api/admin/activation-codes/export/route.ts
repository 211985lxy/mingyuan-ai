import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { recordAdminAudit } from "@/lib/admin-audit"
import { prisma } from "@/lib/prisma"

function escapeCsvValue(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, "\"\"")}"`
  }

  return value
}

export const GET = withAdminOnly(async (request: NextRequest, { admin }) => {
  const url = new URL(request.url)
  const status = url.searchParams.get("status") || ""
  const batchId = url.searchParams.get("batchId") || ""

  const where: Record<string, unknown> = {}
  if (status && ["unused", "used"].includes(status)) {
    where.status = status
  }
  if (batchId) {
    where.batchId = batchId
  }

  const codes = await prisma.activationCode.findMany({
    where,
    select: {
      code: true,
      status: true,
      batchNote: true,
      durationDays: true,
      usedAt: true,
      createdAt: true,
      user: {
        select: { email: true },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 10_001,
  })

  if (codes.length > 10_000) {
    return NextResponse.json({ error: "导出结果超过 10000 条，请先按状态或批次筛选" }, { status: 413 })
  }

  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "activation_codes.export",
    targetType: "activation_code_export",
    metadata: {
      status: status || null,
      batchId: batchId || null,
      resultCount: codes.length,
    },
  })

  const header = "Code,Status,Duration Days,Batch Note,Used By,Used At,Created At"
  const rows = codes.map((c) => {
    const code = c.code.replace(/(.{4})/g, "$1-").replace(/-$/, "")
    const usedBy = c.user?.email || ""
    const usedAt = c.usedAt ? new Date(c.usedAt).toISOString() : ""
    const createdAt = new Date(c.createdAt).toISOString()
    return [
      escapeCsvValue(code),
      escapeCsvValue(c.status),
      escapeCsvValue(String(c.durationDays)),
      escapeCsvValue(c.batchNote || ""),
      escapeCsvValue(usedBy),
      escapeCsvValue(usedAt),
      escapeCsvValue(createdAt),
    ].join(",")
  })

  const csv = [header, ...rows].join("\n")

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="activation-codes-${Date.now()}.csv"`,
      "x-request-id": requestId,
    },
  })
})
