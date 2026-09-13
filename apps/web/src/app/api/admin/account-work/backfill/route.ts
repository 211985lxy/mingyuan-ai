import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import { enqueueAccountWorkInit } from "@/lib/aim/account-work-sync"
import { resolveBoundProject } from "@/lib/account-project-context"
import { recordAdminAudit } from "@/lib/admin-audit"

/**
 * api-inventory: domain=admin/account-work kind=management orchestratable=false auth=admin_session input=bounded_json_object
 */
export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  try {
    const body = await parseJsonRecord(request)
    const accountId = typeof body.accountId === "string" ? body.accountId : undefined
    const rows = await prisma.douyinAccountBinding.findMany({
      where: accountId ? { id: accountId } : {},
      select: { id: true, userId: true },
      take: 200,
    })
    let queued = 0
    for (const row of rows) {
      try {
        const project = await resolveBoundProject({ userId: row.userId })
        await enqueueAccountWorkInit({ userId: row.userId, projectId: project.id, accountId: row.id })
        queued += 1
      } catch (error) {
        console.warn("[account-work-backfill] skip", row.id, error instanceof Error ? error.message : error)
      }
    }
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "account_work.backfill",
      targetType: "douyin_binding",
      targetId: accountId ?? "all",
      metadata: { queued, scanned: rows.length },
    })
    return NextResponse.json({ queued, scanned: rows.length }, { headers: { "x-request-id": requestId } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "回补失败" }, { status: 400 })
  }
})
