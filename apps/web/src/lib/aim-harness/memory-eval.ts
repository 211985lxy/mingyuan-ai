/**
 * 记忆治理评估套件（正本阶段 4，≥20 标注集）。
 * 确定性规则：candidate/rejected/superseded/expired 不得进入生产召回。
 */

import type { AimMemoryStatus } from "@/lib/aim-memory"

export interface MemoryEvalItem {
  id: string
  status: AimMemoryStatus
  expiresAt: string | null
  kind: "decision" | "preference" | "fact" | "conversation_summary"
  content: string
  /** 标注：是否应出现在生产上下文 */
  expectInProductionContext: boolean
  note: string
}

export interface MemoryEvalReport {
  total: number
  passed: number
  failed: number
  failures: Array<{ id: string; expected: boolean; actual: boolean; note: string }>
}

/**
 * @description 判断一条记忆在给定时刻是否可进入生产召回
 */
export function isMemoryEligibleForProductionRecall(
  item: Pick<MemoryEvalItem, "status" | "expiresAt">,
  now: Date = new Date(),
): boolean {
  if (item.status !== "active") return false
  if (!item.expiresAt) return true
  return new Date(item.expiresAt).getTime() > now.getTime()
}

function buildSuite(): MemoryEvalItem[] {
  const future = "2099-01-01T00:00:00.000Z"
  const past = "2020-01-01T00:00:00.000Z"
  const items: MemoryEvalItem[] = []

  for (let i = 1; i <= 8; i++) {
    items.push({
      id: `mem_active_${i}`,
      status: "active",
      expiresAt: i % 2 === 0 ? future : null,
      kind: i % 2 === 0 ? "decision" : "fact",
      content: `已批准事实 ${i}`,
      expectInProductionContext: true,
      note: "active 且未过期应召回",
    })
  }

  for (let i = 1; i <= 5; i++) {
    items.push({
      id: `mem_candidate_${i}`,
      status: "candidate",
      expiresAt: null,
      kind: "preference",
      content: `候选偏好 ${i}`,
      expectInProductionContext: false,
      note: "candidate 未经审核不得进入生产上下文",
    })
  }

  for (let i = 1; i <= 3; i++) {
    items.push({
      id: `mem_rejected_${i}`,
      status: "rejected",
      expiresAt: null,
      kind: "fact",
      content: `已拒绝 ${i}`,
      expectInProductionContext: false,
      note: "rejected 不得召回",
    })
  }

  for (let i = 1; i <= 2; i++) {
    items.push({
      id: `mem_superseded_${i}`,
      status: "superseded",
      expiresAt: null,
      kind: "decision",
      content: `已被替代 ${i}`,
      expectInProductionContext: false,
      note: "superseded 不得召回",
    })
  }

  items.push({
    id: "mem_expired_active",
    status: "active",
    expiresAt: past,
    kind: "fact",
    content: "已过期事实",
    expectInProductionContext: false,
    note: "active 但过期不得召回",
  })

  items.push({
    id: "mem_archived",
    status: "archived",
    expiresAt: null,
    kind: "conversation_summary",
    content: "已归档摘要",
    expectInProductionContext: false,
    note: "archived 不得召回",
  })

  return items
}

/** 冻结评估集（≥20） */
export const MEMORY_EVAL_SUITE: readonly MemoryEvalItem[] = Object.freeze(buildSuite())

/**
 * @description 跑记忆治理确定性评估
 */
export function runMemoryEvalSuite(
  suite: readonly MemoryEvalItem[] = MEMORY_EVAL_SUITE,
  now: Date = new Date("2026-07-24T00:00:00.000Z"),
): MemoryEvalReport {
  const failures: MemoryEvalReport["failures"] = []
  for (const item of suite) {
    const actual = isMemoryEligibleForProductionRecall(item, now)
    if (actual !== item.expectInProductionContext) {
      failures.push({
        id: item.id,
        expected: item.expectInProductionContext,
        actual,
        note: item.note,
      })
    }
  }
  return {
    total: suite.length,
    passed: suite.length - failures.length,
    failed: failures.length,
    failures,
  }
}

export function renderMemoryEvalMarkdown(report: MemoryEvalReport): string {
  const lines = [
    `# Memory Governance Eval`,
    "",
    `- Total: ${report.total}`,
    `- Passed: ${report.passed}`,
    `- Failed: ${report.failed}`,
    "",
  ]
  if (report.failures.length) {
    lines.push("## Failures")
    for (const f of report.failures) {
      lines.push(`- \`${f.id}\`: expected=${f.expected} actual=${f.actual} (${f.note})`)
    }
  } else {
    lines.push("全部通过：candidate/rejected/superseded/expired 均未进入生产召回。")
  }
  return lines.join("\n")
}
