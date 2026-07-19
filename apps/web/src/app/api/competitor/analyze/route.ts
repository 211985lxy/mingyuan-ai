import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withUserAuth } from '@/lib/user-auth'
import { checkUrlType, parseUrl } from '@/lib/tikhub/url-parser'
import { enqueueBackgroundTask } from "@/lib/background-tasks"
import { areBackgroundTasksEnabled } from "@/lib/background-task-runtime"
import { COMPETITOR_ANALYSIS_TASK_KIND } from "@/lib/competitor-analysis/background-task"
import { getCompetitorPlatformGate } from '@/lib/competitor-analysis/platform-scope'
import { enforceDailyBetaLimit } from '@/lib/internal-beta-limits'
import { competitorAnalyzeBodySchema } from "@/features/competitor/contracts/api"

// Pipeline can take up to 5 minutes (scrape + comments + AI)
export const maxDuration = 300

export const POST = withUserAuth(async (request, { user }) => {
  if (!areBackgroundTasksEnabled()) {
    return NextResponse.json({ error: "BACKGROUND_TASKS_UNAVAILABLE" }, { status: 503 })
  }

  const quotaResponse = await enforceDailyBetaLimit(user.id, 'competitor_analysis')
  if (quotaResponse) return quotaResponse

  const body = await parseJsonBody(request, competitorAnalyzeBodySchema, { maxBytes: 4 * 1024 })

  const rawUrl = typeof body.url === 'string' ? body.url.trim() : ''
  if (!rawUrl) {
    return NextResponse.json({ error: 'INVALID_URL' }, { status: 400 })
  }

  const urlTypeError = checkUrlType(rawUrl)
  if (urlTypeError) {
    return NextResponse.json({ error: urlTypeError }, { status: 400 })
  }

  const parsed = parseUrl(rawUrl)
  if (!parsed) {
    return NextResponse.json({ error: 'UNSUPPORTED_PLATFORM' }, { status: 400 })
  }

  const platformGate = getCompetitorPlatformGate(parsed.platform)
  if (!platformGate.supported) {
    return NextResponse.json({
      error: platformGate.message ?? 'UNSUPPORTED_PLATFORM',
      code: platformGate.code ?? 'UNSUPPORTED_PLATFORM',
    }, { status: 400 })
  }

  // Create the analysis record in pending state
  const analysis = await prisma.$transaction(async (tx) => {
    const created = await tx.competitorAnalysis.create({ data: {
      userId: user.id,
      targetUrl: parsed.pureUrl,
      platform: parsed.platform,
      platformUserId: parsed.rawUserId ?? null,
      status: 'pending',
      currentStep: 'pending',
    } })
    await enqueueBackgroundTask(tx as never, {
      kind: COMPETITOR_ANALYSIS_TASK_KIND,
      aggregateType: "competitor_analysis",
      aggregateId: created.id,
      idempotencyKey: `competitor_analysis:${created.id}`,
    })
    return created
  })

  return NextResponse.json({
    id: analysis.id,
    status: 'pending',
    platform: analysis.platform,
  })
})
