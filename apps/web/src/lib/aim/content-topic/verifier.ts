/**
 * 内容选题核验（content-topic-evidence-v1）。
 * Tool Loop / Business Loop 只读核验：不得直接发布或写正式知识库。
 */

import type { LoopVerificationResult } from "@/lib/aim/loops/contracts"

export interface ContentTopicCandidate {
  title: string
  angle?: string
  evidenceQuotes: string[]
  insufficientInfoNotes?: string[]
  reviewStatus?: "pending" | "approved" | "rejected"
}

export interface ContentTopicVerifierInput {
  projectId?: string
  sourceText: string
  candidates: ContentTopicCandidate[]
  requireHumanReview?: boolean
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, "")
}

function quoteExists(source: string, quote: string): boolean {
  const normalizedQuote = normalizeWhitespace(quote)
  return normalizedQuote.length > 0 && normalizeWhitespace(source).includes(normalizedQuote)
}

/**
 * @description 核验内容选题候选的证据引用与信息不足提示
 */
export function verifyContentTopic(input: ContentTopicVerifierInput): LoopVerificationResult {
  const checks: LoopVerificationResult["checks"] = []
  const add = (id: string, passed: boolean, critical: boolean, detail: string) => {
    checks.push({ id, passed, critical, detail })
  }

  add(
    "content-topic/project",
    Boolean(input.projectId?.trim()),
    true,
    "内容选题核验必须绑定项目。",
  )
  add(
    "content-topic/source",
    input.sourceText.trim().length >= 8,
    true,
    "灵感原文不能为空或过短。",
  )
  add(
    "content-topic/candidates",
    input.candidates.length > 0,
    true,
    "至少需要一个候选选题。",
  )

  const invalidQuotes: string[] = []
  const missingInsufficient: string[] = []
  for (const [index, candidate] of input.candidates.entries()) {
    const notes = candidate.insufficientInfoNotes ?? []
    add(
      `content-topic/title[${index}]`,
      Boolean(candidate.title.trim()),
      true,
      `候选 #${index + 1} 标题不能为空。`,
    )
    // 关键：必须有证据，或明确声明信息不足（避免静默空引用）
    add(
      `content-topic/evidence-or-note[${index}]`,
      candidate.evidenceQuotes.length > 0 || notes.length > 0,
      true,
      `候选 #${index + 1} 须有证据引用，或明确信息不足提示。`,
    )
    // 软：无证据时转入人工（即便已声明不足）
    add(
      `content-topic/evidence[${index}]`,
      candidate.evidenceQuotes.length > 0,
      false,
      candidate.evidenceQuotes.length > 0
        ? `候选 #${index + 1} 已附证据引用。`
        : `候选 #${index + 1} 暂无证据引用，需人工补证。`,
    )
    for (const quote of candidate.evidenceQuotes) {
      if (!quoteExists(input.sourceText, quote)) {
        invalidQuotes.push(`#${index + 1}:${quote.slice(0, 40)}`)
      }
    }
    if (candidate.evidenceQuotes.length === 0 && notes.length === 0) {
      missingInsufficient.push(`#${index + 1}`)
    }
  }

  add(
    "content-topic/quotes",
    invalidQuotes.length === 0,
    true,
    invalidQuotes.length === 0
      ? "所有证据引用均可在灵感原文中定位。"
      : `${invalidQuotes.length} 条证据引用无法在原文定位。`,
  )
  add(
    "content-topic/insufficient-notes",
    missingInsufficient.length === 0,
    false,
    missingInsufficient.length === 0
      ? "证据不足时已给出信息不足提示，或证据已充足。"
      : `候选 ${missingInsufficient.join(", ")} 证据为空且缺少信息不足提示。`,
  )

  const requireReview = input.requireHumanReview !== false
  const allPendingOrReviewed = input.candidates.every(
    (c) => !c.reviewStatus || c.reviewStatus === "pending" || c.reviewStatus === "approved",
  )
  add(
    "content-topic/human-review",
    !requireReview || allPendingOrReviewed,
    true,
    requireReview ? "结果须进入人工审核状态。" : "未强制人工审核。",
  )

  const failed = checks.filter((check) => !check.passed)
  const criticalFailed = failed.filter((check) => check.critical)
  const status: LoopVerificationResult["status"] =
    criticalFailed.length > 0 ? "fail" : failed.length > 0 ? "needs_human" : "pass"

  return {
    status,
    checks,
    evidenceRefs: input.candidates.flatMap((c, i) =>
      c.evidenceQuotes.map((q, qi) => `candidate[${i}].quote[${qi}]:${q}`),
    ),
    summary:
      status === "pass"
        ? `内容选题核验通过（${checks.length} 项）。`
        : status === "needs_human"
          ? `内容选题信息不足，${failed.length} 项需人工判断。`
          : `内容选题核验失败，${criticalFailed.length} 项关键检查未通过。`,
    nextAction: status === "fail" ? "停止自动推进并人工接管" : "进入人工审核",
  }
}
