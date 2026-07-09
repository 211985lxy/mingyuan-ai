import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const INTERNAL_BETA_LIMITS = {
  aimChatDaily: 30,
  aimGenerateDaily: 30,
  videoCopyExtractionDaily: 10,
  competitorAnalysisDaily: 3,
  videoTaskDaily: 2,
  watchAccounts: 3,
  watchRefreshDaily: 3,
  clientProjects: 3,
  knowledgeEntriesPerProject: 100,
  avatars: 1,
  uploadBytes: 10 * 1024 * 1024,
}

type DailyKind = "aim_chat" | "aim_generate" | "video_copy_extraction" | "competitor_analysis" | "video_task"

/**
 * 免限制白名单：优先从环境变量读取（逗号分隔），部署后通过 .env 配置即可，无需改代码。
 * 环境变量: UNLIMITED_BETA_EMAILS="a@b.com,c@d.com"
 *            UNLIMITED_BETA_USER_IDS="user_id_1,user_id_2"
 */
const UNLIMITED_BETA_EMAILS = new Set([
  "1450069849@qq.com",
  "17737232700@qq.com",
  "18126880027@163.com",
  "957739245@qq.com",
  ...(process.env.UNLIMITED_BETA_EMAILS || "").split(",").map(e => e.trim().toLowerCase()).filter(Boolean),
])

const UNLIMITED_BETA_USER_IDS = new Set([
  "cmr97na52001zxhn4nlaxzi4v",
  ...(process.env.UNLIMITED_BETA_USER_IDS || "").split(",").map(id => id.trim()).filter(Boolean),
])

function todayStart() {
  const date = new Date()
  date.setHours(0, 0, 0, 0)
  return date
}

function limitResponse(message: string, limit: number, used: number) {
  return NextResponse.json(
    {
      error: message,
      code: "INTERNAL_BETA_LIMIT_REACHED",
      limit,
      used,
      remaining: Math.max(limit - used, 0),
    },
    { status: 429 },
  )
}

async function dailyCount(userId: string, kind: DailyKind) {
  const createdAt = { gte: todayStart() }
  if (kind === "aim_chat") {
    return prisma.aimExecutionTrace.count({ where: { userId, action: "chat", createdAt } })
  }
  if (kind === "aim_generate") {
    return prisma.aimGeneration.count({ where: { userId, createdAt } })
  }
  if (kind === "video_copy_extraction") {
    return prisma.videoCopyExtraction.count({ where: { userId, createdAt } })
  }
  if (kind === "competitor_analysis") {
    return prisma.competitorAnalysis.count({ where: { userId, createdAt } })
  }
  return prisma.videoTask.count({ where: { userId, createdAt } })
}

async function isUnlimitedBetaUser(userId: string) {
  if (UNLIMITED_BETA_USER_IDS.has(userId)) return true
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return user ? UNLIMITED_BETA_EMAILS.has(user.email.toLowerCase()) : false
}

export async function enforceDailyBetaLimit(userId: string, kind: DailyKind) {
  try {
    if (await isUnlimitedBetaUser(userId)) return null

    const limits = {
      aim_chat: INTERNAL_BETA_LIMITS.aimChatDaily,
      aim_generate: INTERNAL_BETA_LIMITS.aimGenerateDaily,
      video_copy_extraction: INTERNAL_BETA_LIMITS.videoCopyExtractionDaily,
      competitor_analysis: INTERNAL_BETA_LIMITS.competitorAnalysisDaily,
      video_task: INTERNAL_BETA_LIMITS.videoTaskDaily,
    }
    const labels = {
      aim_chat: "AIM 聊天",
      aim_generate: "AIM 生成",
      video_copy_extraction: "爆款文案拆解",
      competitor_analysis: "对标分析",
      video_task: "视频生成",
    }
    const used = await dailyCount(userId, kind)
    const limit = limits[kind]
    return used >= limit ? limitResponse(`${labels[kind]}今日内测额度已用完`, limit, used) : null
  } catch (error) {
    console.error(`[beta-limit] skip daily limit for ${kind}`, error)
    return null
  }
}

export async function enforceCountBetaLimit(input: {
  userId: string
  kind: "watch_account" | "client_project" | "avatar"
}) {
  const { userId, kind } = input
  try {
    if (await isUnlimitedBetaUser(userId)) return null

    const limit = kind === "watch_account"
      ? INTERNAL_BETA_LIMITS.watchAccounts
      : kind === "client_project"
        ? INTERNAL_BETA_LIMITS.clientProjects
        : INTERNAL_BETA_LIMITS.avatars
    const used = kind === "watch_account"
      ? await prisma.watchAccount.count({ where: { userId } })
      : kind === "client_project"
        ? await prisma.clientProject.count({ where: { userId, status: "active" } })
        : await prisma.avatar.count({ where: { userId, status: { not: "failed" } } })
    const label = kind === "watch_account" ? "对标账号" : kind === "client_project" ? "项目" : "数字人"
    return used >= limit ? limitResponse(`内测期最多创建 ${limit} 个${label}`, limit, used) : null
  } catch (error) {
    console.error(`[beta-limit] skip count limit for ${kind}`, error)
    return null
  }
}

export async function enforceWatchRefreshBetaLimit(userId: string, requestedCount: number) {
  try {
    if (await isUnlimitedBetaUser(userId)) return null

    const refreshedToday = await prisma.watchAccount.count({
      where: { userId, lastRefreshedAt: { gte: todayStart() } },
    })
    const used = refreshedToday + requestedCount
    return used > INTERNAL_BETA_LIMITS.watchRefreshDaily
      ? limitResponse(`对标账号今日最多刷新 ${INTERNAL_BETA_LIMITS.watchRefreshDaily} 次`, INTERNAL_BETA_LIMITS.watchRefreshDaily, refreshedToday)
      : null
  } catch (error) {
    console.error("[beta-limit] skip watch refresh limit", error)
    return null
  }
}

export async function enforceKnowledgeBetaLimit(input: {
  userId: string
  projectId?: string | null
  incoming?: number
}) {
  try {
    if (await isUnlimitedBetaUser(input.userId)) return null

    const incoming = input.incoming ?? 1
    const used = await prisma.knowledgeEntry.count({
      where: {
        userId: input.userId,
        status: "active",
        projectId: input.projectId || null,
      },
    })
    const next = used + incoming
    return next > INTERNAL_BETA_LIMITS.knowledgeEntriesPerProject
      ? limitResponse(`每个项目最多保留 ${INTERNAL_BETA_LIMITS.knowledgeEntriesPerProject} 条知识素材`, INTERNAL_BETA_LIMITS.knowledgeEntriesPerProject, used)
      : null
  } catch (error) {
    console.error("[beta-limit] skip knowledge limit", error)
    return null
  }
}

export function enforceUploadSizeLimit(files: File[]) {
  const oversized = files.find((file) => file.size > INTERNAL_BETA_LIMITS.uploadBytes)
  return oversized
    ? NextResponse.json(
        { error: `单个文件不能超过 ${Math.round(INTERNAL_BETA_LIMITS.uploadBytes / 1024 / 1024)}MB`, code: "INTERNAL_BETA_UPLOAD_TOO_LARGE" },
        { status: 413 },
      )
    : null
}
