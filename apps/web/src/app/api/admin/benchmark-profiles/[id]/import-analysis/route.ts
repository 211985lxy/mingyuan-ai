import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withAdminOrEditor } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { buildDefaultKnowledgeTags, mergeKnowledgeTags } from "@/lib/knowledge-tags"
import type { CompetitorAnalysisResult } from "@/lib/tikhub/types"

interface NormalizedVideo {
  title?: string
  desc?: string
  likes?: number
  views?: number
  comments?: number
  shares?: number
  url?: string
  awemeId?: string
}

function formatNumber(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(n)) return "-"
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`
  return String(n)
}

// 把 6维评分 + 关键策略提炼成一条可读的「账号诊断」素材
function buildReportContent(result: CompetitorAnalysisResult, accountName: string | null): string {
  const lines: string[] = []
  lines.push(`【账号诊断报告 · ${accountName ?? "真实账号"}】`)
  lines.push("")

  const s = result.scores
  lines.push("一、六维评分")
  lines.push(`- 内容力：${s.content_power}　增长力：${s.growth_power}　互动力：${s.engagement_power}`)
  lines.push(`- 变现力：${s.monetization_power}　人设力：${s.persona_power}　运营力：${s.operation_power}`)
  lines.push(`- 综合：${s.overall}`)
  lines.push("")

  const ov = result.sections?.account_overview
  if (ov) {
    lines.push("二、账号定位")
    if (ov.positioning) lines.push(`- 定位：${ov.positioning}`)
    if (ov.differentiator) lines.push(`- 差异化：${ov.differentiator}`)
    if (ov.content_vertical) lines.push(`- 内容赛道：${ov.content_vertical}`)
    lines.push("")
  }

  const cs = result.sections?.content_strategy
  if (cs) {
    lines.push("三、内容策略")
    if (cs.hook_patterns?.length) lines.push(`- 开头钩子：${cs.hook_patterns.slice(0, 4).join("｜")}`)
    if (cs.viral_formula) lines.push(`- 爆款公式：${cs.viral_formula}`)
    if (cs.posting_frequency) lines.push(`- 更新频率：${cs.posting_frequency}`)
    lines.push("")
  }

  const rec = result.sections?.recommendations
  if (rec?.reusable_strategies?.length) {
    lines.push("四、可复用策略（迁移给本 IP 时只借结构与钩子，不照搬）")
    rec.reusable_strategies.slice(0, 5).forEach((strat, i) => lines.push(`${i + 1}. ${strat}`))
    lines.push("")
  }

  return lines.join("\n").trim()
}

// 把爆款作品池提炼成一条「爆款样本」素材
function buildViralContent(
  videos: NormalizedVideo[],
  accountName: string | null
): string | null {
  const picks = videos.slice(0, 8).filter((v) => v.title || v.desc)
  if (picks.length === 0) return null

  const lines: string[] = []
  lines.push(`【爆款作品样本 · ${accountName ?? "真实账号"}】`)
  lines.push("")
  picks.forEach((v, i) => {
    lines.push(`${i + 1}. ${v.title || v.desc}`)
    const stats = [
      v.likes != null ? `赞 ${formatNumber(v.likes)}` : null,
      v.comments != null ? `评 ${formatNumber(v.comments)}` : null,
      v.shares != null ? `转 ${formatNumber(v.shares)}` : null,
    ].filter(Boolean)
    if (stats.length) lines.push(`   ${stats.join("　")}`)
  })
  return lines.join("\n").trim()
}

// 一键拉取：把已分析的竞品报告 + 关联的作品池汇总进档案素材（幂等 + 事务化）
export const POST = withAdminOrEditor(async (request, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "缺少档案 id" }, { status: 400 })
  }

  const body = await parseJsonRecord(request)
  const { competitorAnalysisId } = body
  if (!competitorAnalysisId || typeof competitorAnalysisId !== "string") {
    return NextResponse.json({ error: "competitorAnalysisId 必填" }, { status: 400 })
  }

  const profile = await prisma.benchmarkProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, projectId: true, name: true },
  })
  if (!profile) {
    return NextResponse.json({ error: "真实档案不存在" }, { status: 404 })
  }

  const analysis = await prisma.competitorAnalysis.findUnique({
    where: { id: competitorAnalysisId },
  })
  if (!analysis) {
    return NextResponse.json({ error: "竞品分析记录不存在" }, { status: 404 })
  }
  if (analysis.userId !== profile.userId) {
    return NextResponse.json({ error: "竞品分析不属于该档案所属用户" }, { status: 403 })
  }
  if (analysis.status !== "completed" || !analysis.analysisResult) {
    return NextResponse.json({ error: "该竞品分析尚未完成，无法导入" }, { status: 400 })
  }

  // 幂等检查：同 competitorAnalysisId 是否已经导入过
  const existingImport = await prisma.benchmarkProfileItem.findFirst({
    where: {
      profileId: id,
      kind: "report",
      title: { contains: competitorAnalysisId },
    },
    select: { id: true },
  })
  if (existingImport) {
    return NextResponse.json({
      data: { alreadyImported: true, message: "该竞品分析已导入过，无需重复操作" },
    })
  }

  const result = analysis.analysisResult as unknown as CompetitorAnalysisResult

  // 关联同 targetUrl 的 WatchAccount，取爆款/最新作品
  const watchAccount = analysis.targetUrl
    ? await prisma.watchAccount.findFirst({
        where: { userId: profile.userId, targetUrl: analysis.targetUrl },
        select: { viralVideos: true, latestVideos: true, followerCount: true },
      })
    : null

  // 回填档案头部（仅当原值为空时，避免覆盖人工已填内容）
  const headerPatch: Record<string, unknown> = { competitorAnalysisId: analysis.id }
  if (!profile.name || profile.name === analysis.accountName) {
    if (analysis.accountName) headerPatch.name = analysis.accountName
  }
  if (result.sections?.account_overview?.positioning) {
    headerPatch.positioning = result.sections.account_overview.positioning
  }
  if (result.sections?.account_overview?.differentiator) {
    headerPatch.differentiator = result.sections.account_overview.differentiator
  }
  if (analysis.platform) headerPatch.platform = analysis.platform
  if (analysis.platformUserId) headerPatch.platformUserId = analysis.platformUserId
  if (analysis.targetUrl) headerPatch.accountUrl = analysis.targetUrl
  if (watchAccount?.followerCount != null) headerPatch.followerCount = watchAccount.followerCount
  else if (analysis.followerCount != null) headerPatch.followerCount = analysis.followerCount

  const createdItems: Array<{ id: string; kind: string; title: string; content: string }> = []

  // 1) 账号诊断报告
  const reportContent = buildReportContent(result, analysis.accountName)
  if (reportContent) {
    createdItems.push({
      id: "",
      kind: "report",
      title: `账号诊断 · ${analysis.accountName ?? "真实账号"} [${competitorAnalysisId.slice(0, 8)}]`,
      content: reportContent,
    })
  }

  // 2) 爆款作品样本（优先 viralVideos，回退 latestVideos，再回退报告 stats.top_videos）
  const pool: NormalizedVideo[] = []
  if (Array.isArray(watchAccount?.viralVideos)) pool.push(...(watchAccount!.viralVideos as NormalizedVideo[]))
  if (Array.isArray(watchAccount?.latestVideos)) pool.push(...(watchAccount!.latestVideos as NormalizedVideo[]))
  if (pool.length === 0 && Array.isArray(result.stats?.top_videos)) {
    pool.push(...result.stats.top_videos.map((v) => ({ title: v.title, likes: v.likes, views: v.views, url: v.url })))
  }
  const viralContent = buildViralContent(pool, analysis.accountName)
  if (viralContent) {
    createdItems.push({
      id: "",
      kind: "video",
      title: `爆款作品样本 · ${analysis.accountName ?? "真实账号"}`,
      content: viralContent,
    })
  }

  // 事务：创建 items + KnowledgeEntry + 更新 profile header
  let sortOrder = 0
  const items = await prisma.$transaction(async (tx) => {
    const createdItemsResult = await Promise.all(
      createdItems.map((itemDef) =>
        tx.benchmarkProfileItem.create({
          data: {
            profileId: id,
            kind: itemDef.kind,
            title: itemDef.title,
            content: itemDef.content,
            sortOrder: sortOrder++,
          },
        })
      )
    )

    // 为每条 item 同步创建 KnowledgeEntry
    await Promise.all(
      createdItemsResult.map((item) =>
        tx.knowledgeEntry.create({
          data: {
            userId: profile.userId,
            projectId: profile.projectId,
            category: "benchmark_reference",
            title: `[${profile.name}] ${item.title}`,
            content: item.content,
            tags: mergeKnowledgeTags(
              [`benchmark_profile:${profile.id}`, `benchmark_item:${item.id}`, `kind:${item.kind}`],
              buildDefaultKnowledgeTags("benchmark_reference")
            ),
            sourceType: "manual",
            status: "active",
          },
        })
      )
    )

    // 回填档案头部
    await tx.benchmarkProfile.update({ where: { id }, data: headerPatch })

    return createdItemsResult
  })

  // 向量化（事务外 fire-and-forget，失败记录日志）
  for (const item of items) {
    const linkedEntry = await prisma.knowledgeEntry.findFirst({
      where: {
        category: "benchmark_reference",
        tags: { string_contains: `benchmark_item:${item.id}` },
      },
      select: { id: true },
    })
    if (linkedEntry) {
      ensureKnowledgeEmbedding(linkedEntry.id).catch((err) => {
        console.error(`[benchmark-profile] embedding failed for imported item ${item.id}:`, err)
      })
    }
  }

  return NextResponse.json({
    data: {
      importedCount: items.length,
      items,
      headerPatched: headerPatch,
    },
  })
})
