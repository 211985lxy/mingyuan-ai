import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { parseJsonRecord } from "@/lib/api-contract"
import { AUTOMATION_JOB_CATALOG, type AutomationJobId } from "@/lib/aim/automation-ledger-catalog"
import { findJobOrThrow, runAutomationJobNow } from "@/lib/aim/automation-ledger-run"
import { recordAdminAudit } from "@/lib/admin-audit"

function asJobId(value: unknown): AutomationJobId {
  if (typeof value !== "string" || !AUTOMATION_JOB_CATALOG.some((job) => job.id === value)) {
    throw new Error("未知任务")
  }
  return value as AutomationJobId
}

/**
 * api-inventory: domain=admin/automation-ledger kind=management orchestratable=false auth=admin_session input=bounded_json_object
 */
export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  try {
    const body = await parseJsonRecord(request)
    const job = findJobOrThrow(asJobId(body.jobId))
    const result = await runAutomationJobNow(job.id)
    const requestId = await recordAdminAudit({
      request,
      adminId: admin.id,
      action: "automation_ledger.run",
      targetType: "automation_job",
      targetId: job.id,
      metadata: { status: result.status },
    })
    return NextResponse.json(result.body, { status: result.status, headers: { "x-request-id": requestId } })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "立即执行失败" }, { status: 400 })
  }
})
