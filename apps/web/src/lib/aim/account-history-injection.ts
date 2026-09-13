/**
 * 账号历史上下文注入（WP-A1 → aim-harness）。
 *
 * 把 AccountWorkAsset 投影压缩成"账号历史发布事实"块，作为生成上下文的第五路
 * （与 learnings 并列的独立通道，先里子：直接进知识通道文本，预算机统一治理）。
 * 无账号历史（无绑定/无作品）时返回 null，完全不改变上下文——可证伪的增量。
 */

import { prisma } from "@/lib/prisma"
import { buildAccountHistoryDigest, readWorkStats, type AccountWorkLike } from "@/lib/aim/account-work-assets"

const INJECTION_WINDOW_DAYS = 90
const INJECTION_MAX_WORKS = 200

export interface AccountHistoryBlock {
  block: string
  hash: string
  totalWorks: number
}

/**
 * 一站式入口：加载账号历史并拼进知识通道文本；无账号历史时文本原样返回、hash 为 null。
 * 供 context-assembly 单行调用，避免主装配文件膨胀。
 */
export async function prepareAccountHistoryForKnowledge(
  knowledgeText: string,
  projectId: string | null | undefined,
  options: { now?: Date } = {},
): Promise<{ text: string; hash: string | null }> {
  const accountHistory = await loadAccountHistoryBlockForAimContext(projectId, options)
  if (!accountHistory) return { text: knowledgeText, hash: null }
  return {
    text: `${knowledgeText}\n\n## 账号历史发布事实（参考真实数据，不是凭感觉）\n${accountHistory.block}`,
    hash: accountHistory.hash,
  }
}

export async function loadAccountHistoryBlockForAimContext(
  projectId: string | null | undefined,
  options: { now?: Date } = {},
): Promise<AccountHistoryBlock | null> {
  if (!projectId) return null
  const rows = await prisma.accountWorkAsset.findMany({
    where: { projectId, platform: "douyin" },
    select: {
      externalWorkId: true,
      title: true,
      coverUrl: true,
      publishedAt: true,
      stats: true,
      transcript: true,
      transcriptStatus: true,
      transcriptAttempts: true,
    },
    orderBy: { publishedAt: "desc" },
    take: INJECTION_MAX_WORKS,
  })
  if (rows.length === 0) return null

  const works: AccountWorkLike[] = rows.map((row) => ({
    externalWorkId: row.externalWorkId,
    title: row.title,
    coverUrl: row.coverUrl,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    stats: readWorkStats(row.stats),
    transcript: row.transcript,
    transcriptStatus: (row.transcriptStatus as "none" | "pending" | "ready" | "failed") ?? "none",
    transcriptAttempts: row.transcriptAttempts,
  }))

  const digest = buildAccountHistoryDigest(works, {
    windowDays: INJECTION_WINDOW_DAYS,
    now: (options.now ?? new Date()).toISOString(),
  })
  return { block: digest.digest, hash: digest.hash, totalWorks: digest.totalWorks }
}
