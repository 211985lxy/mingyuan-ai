import { describe, expect, it } from "vitest"

import {
  assertToolAllowedInToolLoop,
  assertToolRegistered,
  listToolLoopTools,
} from "@/lib/aim-harness/tool-registry"
import {
  classifyAimRunError,
  mapToolLoopStopToErrorKind,
} from "@/lib/aim-harness/run-errors"
import { isFormalTopicWriteSuppressed, isLiveMode } from "@/lib/execution-mode"
import { MEMORY_STATUSES } from "@/lib/aim-memory"
import {
  MEMORY_EVAL_SUITE,
  runMemoryEvalSuite,
} from "@/lib/aim-harness/memory-eval"
import {
  assessContentRolloutPromotion,
  CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES,
} from "@/lib/aim-harness/content-rollout-gate"
import { verifyContentTopic } from "@/lib/aim/content-topic/verifier"
import {
  assessSalesSupplementEvidence,
  SALES_SUPPLEMENT_FIXTURES,
} from "@/lib/aim/sales-diagnosis/supplement-fixtures"
import { buildEvalCandidateFromRunSummary } from "@/lib/aim-harness/eval-candidate-from-trace"
import {
  CONTENT_TOPIC_FIXTURES,
  runContentTopicFixtures,
} from "@/lib/aim/content-topic/fixtures"
import { mapTopicCardsToVerifierCandidates } from "@/lib/aim/content-topic/from-cards"
import { runContentTopicVerification } from "@/lib/aim/content-topic/run-verification"

describe("tool registry", () => {
  it("L0 工具允许进入 Tool Loop", () => {
    const loopTools = listToolLoopTools().map((tool) => tool.name)
    expect(loopTools).toEqual(
      expect.arrayContaining([
        "search_project_knowledge",
        "get_project_memories",
        "read_aim_generation",
        "read_work_item",
        "request_human_review",
      ]),
    )
    expect(assertToolAllowedInToolLoop("search_project_knowledge").timeoutMs).toBe(10_000)
  })

  it("未注册与写工具拒绝进入 Tool Loop", () => {
    expect(() => assertToolRegistered("send_customer_message")).toThrow(/未注册/)
    expect(() => assertToolAllowedInToolLoop("aim_harness")).toThrow(/禁止进入/)
    expect(() =>
      assertToolAllowedInToolLoop("search_project_knowledge", ["get_project_memories"]),
    ).toThrow(/未被当前 RunSpec/)
  })
})

describe("run error classification", () => {
  it("映射 tool loop 停止原因", () => {
    expect(mapToolLoopStopToErrorKind("timeout")).toBe("tool_timeout")
    expect(mapToolLoopStopToErrorKind("human_required")).toBe("human_required")
    expect(mapToolLoopStopToErrorKind("max_steps")).toBe("budget_exhausted")
  })

  it("从错误消息分类", () => {
    expect(classifyAimRunError(new Error("工具未注册：x"))).toBe("tool_unauthorized")
    expect(classifyAimRunError(new Error("工具超时：x > 10000ms"))).toBe("tool_timeout")
  })
})

describe("content rollout defaults", () => {
  it("evaluate/capture 抑制正式写入；live 放开", () => {
    expect(isFormalTopicWriteSuppressed("capture_only")).toBe(true)
    expect(isFormalTopicWriteSuppressed("evaluate")).toBe(true)
    expect(isFormalTopicWriteSuppressed("live")).toBe(false)
    expect(isLiveMode("live")).toBe(true)
  })

  it("晋升门禁要求 ≥30 影子样本与连续工作日", () => {
    const blocked = assessContentRolloutPromotion({
      shadowSampleCount: 10,
      consecutiveWorkdaysWithoutP0P1: 2,
      severeFabricationCount: 0,
      idempotentSuppressionObserved: true,
      failureRetryableObserved: true,
      currentLevel: "capture_only",
      targetLevel: "evaluate",
    })
    expect(blocked.ok).toBe(false)
    expect(blocked.reasons.some((r) => r.includes(String(CONTENT_ROLLOUT_MIN_SHADOW_SAMPLES)))).toBe(
      true,
    )

    const ok = assessContentRolloutPromotion({
      shadowSampleCount: 30,
      consecutiveWorkdaysWithoutP0P1: 5,
      severeFabricationCount: 0,
      idempotentSuppressionObserved: true,
      failureRetryableObserved: true,
      currentLevel: "capture_only",
      targetLevel: "evaluate",
    })
    expect(ok.ok).toBe(true)
  })
})

describe("memory lifecycle statuses", () => {
  it("包含 candidate → active → superseded/rejected", () => {
    expect(MEMORY_STATUSES).toEqual(
      expect.arrayContaining(["candidate", "active", "superseded", "rejected", "archived"]),
    )
  })

  it("记忆评估集 ≥20 且全部通过", () => {
    expect(MEMORY_EVAL_SUITE.length).toBeGreaterThanOrEqual(20)
    const report = runMemoryEvalSuite()
    expect(report.failed).toBe(0)
    expect(report.passed).toBe(report.total)
  })
})

describe("content topic verifier", () => {
  it("证据可定位时通过；虚构引用失败", () => {
    const source = "群里说下周要做敏感肌美白选题，主打职场通勤场景。"
    const pass = verifyContentTopic({
      projectId: "proj_1",
      sourceText: source,
      candidates: [
        {
          title: "敏感肌通勤美白",
          evidenceQuotes: ["敏感肌美白选题"],
          reviewStatus: "pending",
        },
      ],
    })
    expect(pass.status).toBe("pass")

    const fail = verifyContentTopic({
      projectId: "proj_1",
      sourceText: source,
      candidates: [
        {
          title: "虚构爆款",
          evidenceQuotes: ["原文根本没有的句子"],
          reviewStatus: "pending",
        },
      ],
    })
    expect(fail.status).toBe("fail")
  })

  it("内容 fixture 成功/不足/工具失败各 ≥3 且状态符合预期", () => {
    const byKind = { success: 0, insufficient: 0, tool_failed: 0 }
    for (const f of CONTENT_TOPIC_FIXTURES) byKind[f.kind] += 1
    expect(byKind.success).toBeGreaterThanOrEqual(3)
    expect(byKind.insufficient).toBeGreaterThanOrEqual(3)
    expect(byKind.tool_failed).toBeGreaterThanOrEqual(3)
    const report = runContentTopicFixtures()
    expect(report.failed).toEqual([])
  })

  it("卡片映射无证据时声明信息不足，且阻断正式写入仅在 fail", () => {
    const candidates = mapTopicCardsToVerifierCandidates(
      [{ title: "完全无关标题", hook: "编造钩子" }],
      "今天天气不错，适合出门散步。",
    )
    expect(candidates[0].insufficientInfoNotes?.length).toBeGreaterThan(0)

    const blocked = runContentTopicVerification({
      projectId: "proj_x",
      sourceText: "短",
      cards: [{ title: "x" }],
    })
    expect(blocked.blockFormalWrite).toBe(true)

    const ok = runContentTopicVerification({
      projectId: "proj_x",
      sourceText: "群里说下周要做敏感肌美白选题，主打职场通勤。",
      cards: [{ title: "敏感肌美白", hook: "敏感肌美白选题" }],
    })
    expect(ok.blockFormalWrite).toBe(false)
  })
})

describe("sales supplement fixtures", () => {
  it("覆盖成功 / 不足 / 工具失败各至少 3 条", () => {
    const byKind = { success: 0, insufficient: 0, tool_failed: 0 }
    for (const f of SALES_SUPPLEMENT_FIXTURES) byKind[f.kind] += 1
    expect(byKind.success).toBeGreaterThanOrEqual(3)
    expect(byKind.insufficient).toBeGreaterThanOrEqual(3)
    expect(byKind.tool_failed).toBeGreaterThanOrEqual(3)
    for (const fixture of SALES_SUPPLEMENT_FIXTURES) {
      const result = assessSalesSupplementEvidence(fixture)
      expect(result.humanRequired).toBe(fixture.expectHumanHandoff)
      expect(result.insufficient).toBe(fixture.expectInsufficientWarning)
    }
  })
})

describe("trace to eval candidates", () => {
  it("仅对失败/虚构产出候选，不自动入库", () => {
    expect(
      buildEvalCandidateFromRunSummary({
        agentId: "content_producer",
        rawInput: "正常稿",
        qualityStatus: "pass",
      }),
    ).toBeNull()
    const cand = buildEvalCandidateFromRunSummary({
      agentId: "content_producer",
      rawInput: "可疑稿",
      fabricatedSuspected: true,
    })
    expect(cand?.status).toBe("candidate")
  })
})
