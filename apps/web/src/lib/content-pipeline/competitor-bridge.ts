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
  /** 限定查询的用户 ID（可选，不传则查所有用户） */
  userId?: string
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
    // 构建 Prisma where 条件
    const conditions: Array<Record<string, unknown>> = []

    // 策略 1：按平台筛选
    conditions.push({ platform: input.platform })

    // 策略 2：按用户筛选（如果指定了 userId）
    if (input.userId) {
      conditions.push({ userId: input.userId })
    }

    // 查询该平台的所有 WatchAccount
    const accounts = await prisma.watchAccount.findMany({
      where: { AND: conditions },
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