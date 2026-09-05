/**
 * 复盘表格导入服务：文本 → 既有解析管线 → upsert ContentOutcome。
 * 与粘贴路径同一条管线；识别不了的字段不写入，留给 upsert 合并（空值≠0）。
 */

import { prepareAnalyticsIngest } from "@/lib/aim/platform-analytics-ingest"
import { sanitizeOutcomeBody, buildOutcomeUpdate } from "@/lib/content-outcome"

export interface OutcomeImportDbPort {
  aimGeneration: {
    findFirst(args: unknown): Promise<Record<string, unknown> | null>
  }
  contentOutcome: {
    upsert(args: unknown): Promise<Record<string, unknown>>
  }
}

export type OutcomeImportResult =
  | {
      status: "ok"
      outcome: Record<string, unknown>
      summary: string
      confidence: string
      missingHints: string[]
    }
  | {
      status: "not_found"
    }
  | {
      status: "parse_failed"
      message: string
      rawSnippet: string
      missingHints: string[]
    }

export async function importOutcomeFromText(input: {
  db: OutcomeImportDbPort
  userId: string
  generationId: string
  text: string
}): Promise<OutcomeImportResult> {
  const owned = await input.db.aimGeneration.findFirst({
    where: { id: input.generationId, userId: input.userId },
    select: { id: true, topicSelectionId: true, projectId: true },
  })
  if (!owned) return { status: "not_found" }

  const prepared = prepareAnalyticsIngest({ text: input.text, generationId: input.generationId })
  if (prepared.status !== "ready") {
    return {
      status: "parse_failed",
      message: prepared.message,
      rawSnippet: prepared.parsed.rawSnippet,
      missingHints: prepared.parsed.missingHints,
    }
  }

  const body = prepared.body as unknown as Record<string, unknown>
  const sanitized = sanitizeOutcomeBody(body)
  // 只覆盖本次识别出的字段，重复导入不清掉此前已填的其他窗口/字段
  const presentKeys = new Set(Object.keys(body))

  const outcome = await input.db.contentOutcome.upsert({
    where: {
      userId_generationId_collectWindowDay: {
        userId: input.userId,
        generationId: input.generationId,
        collectWindowDay: sanitized.collectWindowDay,
      },
    },
    create: {
      userId: input.userId,
      generationId: input.generationId,
      topicSelectionId: owned.topicSelectionId ?? null,
      projectId: owned.projectId ?? null,
      ...sanitized,
    },
    update: buildOutcomeUpdate(sanitized, presentKeys),
  })

  return {
    status: "ok",
    outcome,
    summary: prepared.parsed.summary,
    confidence: prepared.parsed.confidence,
    missingHints: prepared.parsed.missingHints,
  }
}
