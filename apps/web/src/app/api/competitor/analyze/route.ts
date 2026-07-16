import { parseJsonBody } from "@/lib/api-contract"
import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { withUserAuth } from '@/lib/user-auth'
import { checkUrlType, parseUrl } from '@/lib/tikhub/url-parser'
import { runCompetitorAnalysisPipeline } from '@/lib/competitor-analysis/pipeline'
import { getCompetitorPlatformGate } from '@/lib/competitor-analysis/platform-scope'
import { logger } from '@/lib/logger'
import { enforceDailyBetaLimit } from '@/lib/internal-beta-limits'
import { competitorAnalyzeBodySchema } from "@/features/competitor/contracts/api"

// Pipeline can take up to 5 minutes (scrape + comments + AI)
export const maxDuration = 300

export const POST = withUserAuth(async (request, { user }) => {
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
  const analysis = await prisma.competitorAnalysis.create({
    data: {
      userId: user.id,
      targetUrl: parsed.pureUrl,
      platform: parsed.platform,
      platformUserId: parsed.rawUserId ?? null,
      status: 'pending',
      currentStep: 'pending',
    },
  })

  // Trigger pipeline non-blocking (same pattern as marketing-analysis.ts)
  runCompetitorAnalysisPipeline(analysis.id).catch((err: unknown) => {
    logger.error({ err, analysisId: analysis.id }, 'Competitor analysis pipeline failed')
  })

  return NextResponse.json({
    id: analysis.id,
    status: 'pending',
    platform: analysis.platform,
  })
})
