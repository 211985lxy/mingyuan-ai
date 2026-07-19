import type { LoopVerificationResult } from "@/lib/aim/loops/contracts"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import type { MeetingEvidence, MeetingEvidenceKind } from "./evidence"

export interface SalesDiagnosisVerifierInput {
  projectId?: string
  customer: string
  meetingTitle: string
  transcript: string
  insight: MeetingInsight
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, "")
}

function quoteExists(transcript: string, quote: string): boolean {
  const normalizedQuote = normalizeWhitespace(quote)
  return normalizedQuote.length > 0 && normalizeWhitespace(transcript).includes(normalizedQuote)
}

function evidenceFor(
  evidence: MeetingEvidence[],
  kind: MeetingEvidenceKind,
): MeetingEvidence[] {
  return evidence.filter((item) => item.kind === kind)
}

function evidenceMentions(
  evidence: MeetingEvidence[],
  kind: MeetingEvidenceKind,
  value: string,
): boolean {
  const needle = normalizeWhitespace(value)
  if (!needle) return false
  return evidenceFor(evidence, kind).some((item) =>
    normalizeWhitespace(item.quote).includes(needle),
  )
}

function looksLikeCustomerCommitment(value: string): boolean {
  return /(?:客户|[\u4e00-\u9fa5]{1,4}(?:总|经理)).{0,8}(?:承诺|答应|表示(?:会|将)|会在|将于|确定|确认|同意)|承诺.{0,12}(?:签约|付款|提供|确认|安排|推进)/.test(value)
}

export function verifySalesDiagnosis(
  input: SalesDiagnosisVerifierInput,
): LoopVerificationResult {
  const checks: LoopVerificationResult["checks"] = []
  const add = (id: string, passed: boolean, critical: boolean, detail: string) => {
    checks.push({ id, passed, critical, detail })
  }
  const { insight } = input
  const evidence = insight.evidence ?? []
  const validEvidence = evidence.filter((item) => quoteExists(input.transcript, item.quote))
  const invalidEvidence = evidence.filter((item) => !quoteExists(input.transcript, item.quote))

  add("sales-diagnosis/project", Boolean(input.projectId?.trim()), true, "销售诊断必须绑定项目。")
  add("sales-diagnosis/customer", Boolean(input.customer.trim()), true, "客户名称不能为空。")
  add("sales-diagnosis/title", Boolean(input.meetingTitle.trim()), true, "会议标题不能为空。")
  add("sales-diagnosis/transcript", input.transcript.trim().length >= 8, true, "会议原文不能为空或过短。")
  add(
    "sales-diagnosis/deliverable",
    insight.goals.length > 0 || insight.deliveryTasks.length > 0,
    true,
    "至少需要一个客户目标或交付任务。",
  )
  add(
    "sales-diagnosis/next-action",
    insight.followUps.length > 0 || insight.deliveryTasks.length > 0,
    true,
    "至少需要一个跟进建议或交付任务。",
  )
  add(
    "sales-diagnosis/quotes",
    invalidEvidence.length === 0,
    true,
    invalidEvidence.length === 0
      ? "所有证据引用均可在会议原文中定位。"
      : `${invalidEvidence.length} 条证据引用无法在会议原文中定位。`,
  )

  const unsupportedBudgets = insight.budgets.filter(
    (budget) => !evidenceMentions(validEvidence, "budget", budget),
  )
  add(
    "sales-diagnosis/budget-evidence",
    unsupportedBudgets.length === 0,
    true,
    unsupportedBudgets.length === 0 ? "预算判断均有原文证据。" : "存在无原文证据的预算判断。",
  )

  const unsupportedOwners = insight.deliveryTasks.filter(
    (task) => task.owner && !evidenceMentions(validEvidence, "task", task.owner),
  )
  add(
    "sales-diagnosis/owner-evidence",
    unsupportedOwners.length === 0,
    true,
    unsupportedOwners.length === 0 ? "负责人判断均有原文证据。" : "存在无原文证据的负责人判断。",
  )

  const commitments = evidenceFor(validEvidence, "commitment")
    .filter((item) =>
      looksLikeCustomerCommitment(item.quote)
        && normalizeWhitespace(item.quote).includes(normalizeWhitespace(item.statement)),
    )
  const unsupportedCommitments = insight.followUps.filter(
    (followUp) => looksLikeCustomerCommitment(followUp)
      && !evidenceMentions(validEvidence, "commitment", followUp),
  )
  add(
    "sales-diagnosis/commitment-evidence",
    evidenceFor(evidence, "commitment").length === commitments.length
      && unsupportedCommitments.length === 0,
    true,
    unsupportedCommitments.length === 0
      ? "客户承诺均有原文证据；普通跟进建议不视为客户承诺。"
      : "跟进内容包含疑似客户承诺，但缺少对应原文证据。",
  )

  const claimedDecisionStage = insight.decisionStage || insight.decisionStageRaw
  const decisionStageSupported = !claimedDecisionStage || validEvidence.some((item) =>
    normalizeWhitespace(item.quote).includes(normalizeWhitespace(claimedDecisionStage)),
  )
  add(
    "sales-diagnosis/decision-stage-evidence",
    decisionStageSupported,
    true,
    decisionStageSupported ? "决策阶段为空或有原文证据。" : "决策阶段缺少原文证据。",
  )
  add(
    "sales-diagnosis/decision-stage-enum",
    !insight.decisionStageUnresolved,
    false,
    insight.decisionStageUnresolved ? "决策阶段不在标准枚举中，需人工判断。" : "决策阶段已收敛或未提供。",
  )

  const hasGoalOrTaskEvidence = evidenceFor(validEvidence, "goal").length > 0
    || evidenceFor(validEvidence, "task").length > 0
  add(
    "sales-diagnosis/core-evidence",
    hasGoalOrTaskEvidence,
    false,
    hasGoalOrTaskEvidence ? "至少一个目标或任务有原文证据。" : "目标和任务均缺少原文证据，需人工判断。",
  )

  const failed = checks.filter((check) => !check.passed)
  const criticalFailed = failed.filter((check) => check.critical)
  const status: LoopVerificationResult["status"] = criticalFailed.length > 0
    ? "fail"
    : failed.length > 0
      ? "needs_human"
      : "pass"

  return {
    status,
    checks,
    evidenceRefs: validEvidence.map((item, index) => `${item.kind}[${index}]:${item.quote}`),
    summary: status === "pass"
      ? `销售诊断确定性验证通过（${checks.length} 项）。`
      : status === "needs_human"
        ? `销售诊断信息不足，${failed.length} 项需人工判断。`
        : `销售诊断验证失败，${criticalFailed.length} 项关键检查未通过。`,
    nextAction: status === "fail" ? "停止自动推进并人工接管" : "进入人工审核",
  }
}
