import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { AUTOMATION_JOB_CATALOG, type AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { setAutomationJobEnabled } from "@/lib/aim/automation-job-flags-store"
import { recordAdminAudit } from "@/lib/admin-audit"

/**
 * api-inventory: domain=admin/automation-ledger kind=management orchestratable=false auth=admin_session input=bounded_json_object
 */
export const PATCH = withAdminOnly(async (request: NextRequest, { admin }) => {
  try {
    const body = await parseJsonRecord(request)
    const jobId = body.jobId
    if (typeof jobId !== "string" || !AUTOMATION_JOB_CATALOG.some((job) => job.id === jobId)) {
      return NextResponse.json({ error: "未知任务" }, { status: 400 })
    }
    if (typeof body.enabled !== "boolean") {
      return NextResponse.json({ error: "enabled 必须是 true/false" }, { status: 400 })
    }
    await setAutomationJobEnabled({
      jobId: jobId as AutomationJobId,
      enabled: body.enabled,
      updatedBy: admin.id,
    })
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "automation_ledger.toggle",
      targetType: "automation_job",
      targetId: jobId,
      metadata: { enabled: body.enabled },
    })
    return NextResponse.json({ ok: true, jobId, enabled: body.enabled }, { headers: { "x-request-id": requestId } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "开关失败" }, { status: 500 })
  }
})
