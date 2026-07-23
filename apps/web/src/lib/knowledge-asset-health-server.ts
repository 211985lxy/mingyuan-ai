/**
 * 知识资产健康度服务端加载（只取 category/status/tags，避免分页漏计）
 */

import { prisma } from "@/lib/prisma"
import {
  computeKnowledgeAssetHealth,
  type KnowledgeAssetHealthResult,
} from "@/lib/knowledge-asset-health"

/** 单项目扫描上限；超出时结果仍可展示，但标记 truncated */
export const KNOWLEDGE_ASSET_HEALTH_ENTRY_LIMIT = 10_000

export interface KnowledgeAssetHealthPayload {
  health: KnowledgeAssetHealthResult
  scannedCount: number
  truncated: boolean
}

/**
 * @description 按项目加载 slim 条目并计算健康度（确定性，无 LLM）
 */
export async function loadKnowledgeAssetHealth(input: {
  projectId: string
  userId?: string
}): Promise<KnowledgeAssetHealthPayload> {
  const rows = await prisma.knowledgeEntry.findMany({
    where: {
      status: "active",
      projectId: input.projectId,
      ...(input.userId ? { userId: input.userId } : {}),
    },
    select: {
      category: true,
      status: true,
      tags: true,
    },
    orderBy: { createdAt: "asc" },
    take: KNOWLEDGE_ASSET_HEALTH_ENTRY_LIMIT + 1,
  })

  const truncated = rows.length > KNOWLEDGE_ASSET_HEALTH_ENTRY_LIMIT
  const scanned = truncated ? rows.slice(0, KNOWLEDGE_ASSET_HEALTH_ENTRY_LIMIT) : rows

  return {
    health: computeKnowledgeAssetHealth(scanned),
    scannedCount: scanned.length,
    truncated,
  }
}
