import { prisma } from '@/lib/prisma'
import { logger } from '@/lib/logger'
import type { Platform } from '@/lib/tikhub/types'
import { calculateMetrics } from './metrics'
import { analyzeCompetitor } from './analyzer'
import { collectCompetitorData } from './collector'

/**
 * Runs the full competitor analysis pipeline for a given analysisId.
 *
 * Flow: pending → scraping → enriching → analyzing → completed (or failed)
 *
 * This function is designed to be triggered WITHOUT await from the API route:
 *   runCompetitorAnalysisPipeline(id).catch(err => logger.error({ err }, '...'))
 *
 * All DB status transitions are atomic updates. On any error, the record is
 * marked as 'failed' with the error message stored.
 */
export async function runCompetitorAnalysisPipeline(analysisId: string): Promise<void> {
  const log = logger.child({ analysisId })

  try {
    const analysis = await prisma.competitorAnalysis.findUniqueOrThrow({
      where: { id: analysisId },
    })

    await updateStatus(analysisId, 'scraping')
    log.info('Step 1: Collecting account data')
    const collected = await collectCompetitorData({
      platform: analysis.platform as Platform,
      targetUrl: analysis.targetUrl,
      platformUserId: analysis.platformUserId,
      count: 50,
    })
    const { account, videos, comments } = collected
    await saveCollectedData(analysisId, collected)

    await updateStatus(analysisId, 'enriching')
    log.info('Step 2: Calculating metrics')
    const metrics = calculateMetrics(account, videos)
    await saveMetrics(analysisId, comments, metrics)

    await updateStatus(analysisId, 'analyzing')
    log.info('Step 3: AI analysis')
    const result = await analyzeCompetitor(account, videos, comments, metrics)
    await saveAnalysisResult(analysisId, result)

    log.info({ overallScore: result.scores.overall }, 'Pipeline completed')

  } catch (err) {
    log.error({ err }, 'Pipeline failed')
    // Best-effort: update status to failed. Ignore secondary DB errors.
    await prisma.competitorAnalysis.update({
      where: { id: analysisId },
      data: {
        status: 'failed',
        currentStep: 'failed',
        errorMessage: sanitizeErrorForUser(err),
      },
    }).catch((dbErr: unknown) => {
      log.error({ dbErr }, 'Failed to write error status to DB')
    })
  }
}

// ── Internal helpers ──────────────────────────────────────────────────────────

async function saveCollectedData(
  analysisId: string,
  collected: Awaited<ReturnType<typeof collectCompetitorData>>,
): Promise<void> {
  const { platformUserId, account, videos } = collected
  await prisma.competitorAnalysis.update({
    where: { id: analysisId },
    data: {
      platformUserId,
      rawAccountData: account as never,
      rawVideoData: videos as never,
      accountName: account.nickname,
      accountAvatar: account.avatar,
      followerCount: account.followerCount,
      videoCount: account.videoCount,
      collectionSource: collected.collectionSource,
      fallbackUsed: collected.fallbackUsed,
      fallbackReason: collected.fallbackReason,
    },
  })
}

async function saveMetrics(
  analysisId: string,
  comments: unknown,
  metrics: ReturnType<typeof calculateMetrics>,
): Promise<void> {
  await prisma.competitorAnalysis.update({
    where: { id: analysisId },
    data: {
      rawCommentData: comments as never,
      metricsData: metrics as never,
    },
  })
}

async function saveAnalysisResult(
  analysisId: string,
  result: Awaited<ReturnType<typeof analyzeCompetitor>>,
): Promise<void> {
  await prisma.competitorAnalysis.update({
    where: { id: analysisId },
    data: {
      status: 'completed',
      currentStep: 'completed',
      analysisResult: result as never,
      overallScore: result.scores.overall,
      completedAt: new Date(),
    },
  })
}

async function updateStatus(id: string, status: string): Promise<void> {
  await prisma.competitorAnalysis.update({
    where: { id },
    data: { status, currentStep: status },
  })
}

export function sanitizeErrorForUser(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  // User-safe messages from analyzer pass through
  if (msg.startsWith('AI 分析')) return msg
  
  // 如果是本地物理抓取失败，直接透传该明确的业务和诊断报错，避免被下方的模糊过滤误杀
  if (msg.includes('本地物理抓取失败')) {
    return msg
  }
  if (msg.includes('未配置真实对标账号抓取服务')) {
    return msg
  }
  if (msg.includes('AccessDenied') || msg.includes('Unauthorized') || msg.includes('Forbidden')) {
    return `数据采集服务权限失败：${msg}`
  }
  
  // Explicitly warn about missing TIKHUB_API_KEY (精准匹配，绝不误杀)
  if (msg.includes('TIKHUB_API_KEY environment variable is not set')) {
    return '未配置 TIKHUB_API_KEY 环境变量，请在 .env.local 中配置以启用同行对标功能'
  }
  
  // Classify common errors into user-friendly messages
  if (msg.includes('TikHub') || msg.includes('HTTP 4') || msg.includes('HTTP 5')) {
    return '数据采集失败，请稍后重试（提示：请确保输入的是【个人主页链接】，而非单个视频或笔记的链接）'
  }
  if (msg.includes('timeout') || msg.includes('Timeout') || msg.includes('504')) {
    return 'AI 分析超时，请稍后重试'
  }
  return '分析过程中发生错误，请重试（提示：请确保输入的是【个人主页链接】，而非单个视频或笔记的链接）'
}
