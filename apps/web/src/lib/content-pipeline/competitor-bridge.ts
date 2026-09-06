/**
 * 5d 竞品分析标记桥接模块
 *
 * 检测视频作者是否在 AIM 的 WatchAccount 关注列表中。
 * 如果是竞品，返回竞品名称和账号 ID。
 *
 * 匹配策略：
 *   1. 精确匹配 nickname
 *   2. 模糊匹配 targetUrl（同一平台的账号主页链接）
 *   3. 匹配 platformUserId（如果轻抖返回了作者 ID）
 */

import { prisma } from "@/lib/prisma"
import { resolveBoundProject } from "@/lib/account-project-context"

/** 竞品匹配时按平台加载的 WatchAccount 上限：监控账号是有限集合，超出视为异常。 */
const WATCH_ACCOUNT_MATCH_LIMIT = 500

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface CompetitorMatchResult {
  /** 是否为关注中的竞品 */
  isCompetitor: boolean
  /** 竞品账号昵称 */
  competitorName?: string
  /** 竞品账号平台 */
  competitorPlatform?: string
  /** WatchAccount 记录 ID */
  watchAccountId?: string
}

export interface CompetitorMatchInput {
  /** 视频作者名（来自轻抖提取） */
  authorName?: string
  /** 视频平台（douyin / channels 等） */
  platform: string
  /** 视频原始链接（用于反向匹配 targetUrl） */
  videoUrl?: string
  /** 限定查询的用户 ID（不传则不做竞品标记） */
  userId?: string
  /** 限定查询的账号绑定项目（不传则以 userId 的绑定项目为准） */
  projectId?: string
}

// ─── 核心函数 ──────────────────────────────────────────────────────

/**
 * 检查视频作者是否为已关注的竞品账号。
 * 匹配失败时静默返回 isCompetitor: false，不抛异常。
 */
export async function checkCompetitorMatch(
  input: CompetitorMatchInput,
): Promise<CompetitorMatchResult> {
  const empty: CompetitorMatchResult = { isCompetitor: false }

  try {
    // 竞品匹配必须落在“用户 + 绑定项目”内；两者都缺失时禁止跨账号全局扫描。
    if (!input.userId) return empty

    let scope = input.projectId
    if (!scope) {
      scope = (await resolveBoundProject({ userId: input.userId })).id
    }
    if (!scope) return empty

    // 构建 Prisma where 条件
    const conditions: Array<Record<string, unknown>> = [
      { platform: input.platform },
      { userId: input.userId },
      { projectId: scope },
    ]

    // 查询该平台、该账号绑定项目下的所有 WatchAccount
    const accounts = await prisma.watchAccount.findMany({
      where: { AND: conditions },
      take: WATCH_ACCOUNT_MATCH_LIMIT,
      select: {
        id: true,
        nickname: true,
        platform: true,
        platformUserId: true,
        targetUrl: true,
      },
    })

    if (accounts.length === 0) return empty

    // 策略 3：精确匹配作者昵称
    if (input.authorName) {
      const author = input.authorName.trim().toLowerCase()
      const match = accounts.find((a) => {
        const name = (a.nickname || "").trim().toLowerCase()
        return name && name === author
      })
      if (match) {
        return {
          isCompetitor: true,
          competitorName: match.nickname || undefined,
          competitorPlatform: match.platform,
          watchAccountId: match.id,
        }
      }
    }

    // 策略 4：按 targetUrl 域名匹配
    if (input.videoUrl) {
      try {
        const videoHostname = new URL(input.videoUrl).hostname.toLowerCase()
        const match = accounts.find((a) => {
          if (!a.targetUrl) return false
          try {
            return new URL(a.targetUrl).hostname.toLowerCase() === videoHostname
          } catch {
            return false
          }
        })
        if (match) {
          return {
            isCompetitor: true,
            competitorName: match.nickname || undefined,
            competitorPlatform: match.platform,
            watchAccountId: match.id,
          }
        }
      } catch {
        // URL 解析失败，跳过
      }
    }

    return empty
  } catch {
    // 查询异常时静默返回
    return empty
  }
}