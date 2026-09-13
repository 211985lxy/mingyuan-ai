import { NextRequest, NextResponse } from "next/server"
import { assembleAutomationLedger } from "@/lib/aim/automation-ledger"
import { createPrismaAutomationLedgerStore } from "@/lib/aim/automation-ledger-store"
import { loadJobEnabledOverlay } from "@/lib/aim/automation-job-flags-store"
import { isJobEnabledByOverlay } from "@/lib/aim/automation-job-flags"
import { AUTOMATION_JOB_CATALOG } from "@/lib/aim/automation-ledger-catalog"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

export const dynamic = "force-dynamic"

/**
 * api-inventory: domain=aim kind=management orchestratable=false auth=user_session input=none
 */
export async function GET(request: NextRequest) {
  try {
    await authenticateRequest(request)
    const overlay = await loadJobEnabledOverlay()
    const enabledByJob = Object.fromEntries(
      AUTOMATION_JOB_CATALOG.map((job) => [job.id, isJobEnabledByOverlay(job.id, overlay)]),
    )
    const ledger = await assembleAutomationLedger(createPrismaAutomationLedgerStore(), new Date(), enabledByJob)
    return NextResponse.json(ledger)
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "自动化台账读取失败" }, { status: 500 })
  }
}
