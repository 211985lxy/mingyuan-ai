/**
 * 内容选题核验入口：卡片 → 候选 → verifyContentTopic。
 * 供 inspiration 管道与 live topic-chat 共用。
 */

import type { LoopVerificationResult } from "@/lib/aim/loops/contracts"
import { mapTopicCardsToVerifierCandidates, type TopicCardLike } from "./from-cards"
import { verifyContentTopic } from "./verifier"

export interface ContentTopicVerificationBundle {
  verification: LoopVerificationResult
  /** 核验失败时禁止写正式 TopicSelection */
  blockFormalWrite: boolean
  /** evaluate/live 建议写入的 processingStage 覆盖 */
  processingStageHint: "verification_failed" | "verification_needs_human" | null
}

/**
 * @description 对生成选题跑 content-topic-evidence-v1 核验
 */
export function runContentTopicVerification(input: {
  projectId?: string | null
  sourceText: string
  cards: TopicCardLike[]
}): ContentTopicVerificationBundle {
  const candidates = mapTopicCardsToVerifierCandidates(input.cards, input.sourceText)
  const verification = verifyContentTopic({
    projectId: input.projectId ?? undefined,
    sourceText: input.sourceText,
    candidates,
    requireHumanReview: true,
  })

  return {
    verification,
    blockFormalWrite: verification.status === "fail",
    processingStageHint:
      verification.status === "fail"
        ? "verification_failed"
        : verification.status === "needs_human"
          ? "verification_needs_human"
          : null,
  }
}

/**
 * @description 将核验摘要压成可入库短文本（不影响 generatedTopics 数组形态）
 */
export function formatContentTopicVerificationNote(
  verification: LoopVerificationResult,
): string | null {
  if (verification.status === "pass") return null
  return `${verification.summary}｜下一步：${verification.nextAction}`
}
