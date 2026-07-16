import { prisma } from "@/lib/prisma"

import { sha256 } from "./hashing"
import type { AimContextSource, AimRunSpec } from "./types"

/** 将声明式上下文与实际引用的知识条目收口为快照清单。 */
export async function buildAimContextManifest(input: {
  spec: AimRunSpec
  userId?: string
  projectId?: string | null
  citedKnowledgeIds?: string[]
  provided?: AimContextSource[]
}): Promise<AimContextSource[]> {
  const sources: AimContextSource[] = [...(input.provided ?? [])]
  if (!sources.some((source) => source.kind === "request")) {
    sources.push({
      kind: "request",
      id: "raw_input",
      charCount: input.spec.rawInput.length,
      contentHash: sha256(input.spec.rawInput),
    })
  }

  const knowledgeIds = input.citedKnowledgeIds ?? []
  const missingIds = knowledgeIds.filter((id) =>
    !sources.some((source) => source.kind === "knowledge" && source.id === id),
  )
  if (missingIds.length === 0) return sources

  try {
    const rows = await prisma.knowledgeEntry.findMany({
      where: {
        id: { in: missingIds },
        ...(input.userId ? { userId: input.userId } : {}),
        ...(input.projectId ? { projectId: input.projectId } : {}),
      },
      select: { id: true, content: true, updatedAt: true },
      take: 100,
    })
    for (const row of rows) {
      sources.push({
        kind: "knowledge",
        id: row.id,
        updatedAt: row.updatedAt.toISOString(),
        charCount: row.content.length,
        contentHash: sha256(row.content),
      })
    }
  } catch {
    // 快照是 best-effort，不能阻断已完成的交付。
  }

  return sources
}
