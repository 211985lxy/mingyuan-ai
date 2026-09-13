import { NextRequest, NextResponse } from "next/server"
import { validateCronSecret } from "@/lib/admin-auth"
import { isAutomationJobEnabled } from "@/lib/aim/automation-job-flags-store"
import type { AutomationJobId } from "@/lib/aim/automation-ledger-catalog"

export async function authorizeCronJob(
  request: NextRequest,
  jobId: AutomationJobId,
): Promise<NextResponse | null> {
  if (!validateCronSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }
  if (!(await isAutomationJobEnabled(jobId))) {
    return NextResponse.json({ skipped: true, reason: "job_disabled", jobId })
  }
  return null
}
