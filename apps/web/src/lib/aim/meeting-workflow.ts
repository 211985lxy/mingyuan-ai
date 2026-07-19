/**
 * 客户会议洞察工作流（WP-6B）。
 *
 * 把三段链路串成一条可追踪、可幂等的经营事项流程：
 *   会议原文 → AIM 模型层抽取结构化 JSON（meeting-insight-extract）
 *   → meeting-insight 域层规整与校验
 *   → 经营事项进入「待人工审核」；失败时进入「失败」并保留可行动错误。
 *
 * 设计决策（对齐简报）：
 * - 服务层直接复用 WP-3 的 startWorkItem / submitWorkItemForReview / failWorkItem，不通过 WP-4 HTTP。
 * - 不新建第二套 Agent 运行时：抽取层复用仓库 LLMClient；本层只编排。
 * - 完整结构化洞察属 AIM 结果；飞书经营事项只回写 结果ID / 摘要 / 结果链接 / 状态。
 *   结果落盘通过注入的 resultSink 端口（仓库无合适的洞察结果表，不建表）。
 * - 幂等：复用 WP-3 的 isSameRequest 语义；已处于待人工审核且结果一致时，不重写、不重抽、不重落盘。
 * - 缺失/缠绕信息保留空或 unresolved；失败时写具体可行动错误，绝不静默吞掉。
 */
import { extractMeetingInsightFromTranscript, type CompleteFn, type MeetingInsightExtractionResult } from "@/lib/aim/meeting-insight-extract"
import {
  buildWorkItemReviewFields,
  extractMeetingInsight,
  type MeetingInsight,
} from "@/lib/aim/meeting-insight"
import { parseFeishuWorkItem } from "@/lib/aim-feishu-work-item"
import { executeAimRun } from "@/lib/aim-harness"
import type { AimRunMetadata } from "@/lib/aim-harness"
import { getRegisteredLoop } from "@/lib/aim/loops/registry"
import { sha256 } from "@/lib/aim-harness/hashing"
import {
  addAimTraceStep,
  claimAimTrace,
  failAimTrace,
  finishAimTrace,
  type AimTraceRecorder,
} from "@/lib/aim-observability"
import type { LoopVerificationResult } from "@/lib/aim/loops/contracts"
import { verifySalesDiagnosis } from "@/lib/aim/sales-diagnosis/verifier"
import { logger } from "@/lib/logger"
import {
  failWorkItem,
  startWorkItem,
  submitWorkItemForReview,
  type WorkItemRecordStore,
} from "@/lib/aim/services/work-item-execution"

/** 工作流输入。recordId 锁定要推进的经营事项。 */
export interface MeetingWorkflowInput {
  recordId: string
  meetingTitle: string
  customer: string
  /** 会议原文/逐字稿/纪要。为空时在抽取前拒绝。 */
  transcript: string
  projectId?: string
  actorId?: string
}

/** 完整洞察的落盘端口（依赖注入）。仓库无合适表时由调用方提供，不建表。 */
export interface InsightResultSink {
  save(input: {
    insight: MeetingInsight
    recordId: string
    projectId?: string
    meetingTitle: string
    customer: string
    /** 会议原文（AimGeneration.rawInput 需要；不落盘方应忽略）。 */
    transcript: string
    executionMetadata?: AimRunMetadata
    verification: LoopVerificationResult
    verificationPolicy: string
  }): Promise<{ aimResultId: string; resultLink: string }>
}

/** 工作流所需端口（全部注入，便于测试与真实实现组装）。 */
export interface MeetingWorkflowPorts {
  /** 经营事项读写 store（绑定真实飞书见 createLarkWorkItemStore）。 */
  store: WorkItemRecordStore
  /** 洞察结果落盘端口。 */
  resultSink: InsightResultSink
  /** LLM complete 端口（默认用 LLMClient.shared()，见 meeting-insight-extract）。 */
  complete?: CompleteFn
  /** Harness 执行边界（仅供测试注入收尾失败）。 */
  executeRun?: typeof executeAimRun
  claimTrace?: typeof claimAimTrace
  finishTrace?: typeof finishAimTrace
  failTrace?: typeof failAimTrace
  addTraceStep?: typeof addAimTraceStep
}

export type MeetingWorkflowResult =
  | { ok: true; status: "待人工审核"; idempotent: boolean; recordId: string; aimResultId: string; execution?: AimRunMetadata }
  | { ok: false; status: "失败" | "待处理" | "处理中" | "待人工审核"; error: string; recordId: string; stopReason?: "duplicate_suppressed" | "verification_failed" }

export function buildMeetingInsightTraceId(recordId: string): string {
  const loop = getRegisteredLoop("sales-diagnosis-v1")
  return `sales_diag_${sha256(`${recordId}|${loop.id}|${loop.version}`).slice(0, 28)}`
}

async function failStartedWorkItem(
  store: WorkItemRecordStore,
  recordId: string,
  message: string,
): Promise<{ status: "失败" | "处理中"; error: string }> {
  const failed = await failWorkItem(store, recordId, { errorMessage: message })
  if (failed.ok) return { status: "失败", error: message }
  return {
    status: "处理中",
    error: `${message}；且失败状态回写失败：${failed.error}`,
  }
}

/**
 * 读取并判断该记录是否已完成会议洞察审核。
 * 用于幂等预检：已处于「待人工审核」且挂了结果ID → 视为已落定。
 * 读失败/记录缺失时按“未落定”处理，交由后续 startWorkItem 兜底（错误不丢）。
 */
async function readExistingReview(
  store: WorkItemRecordStore,
  recordId: string,
): Promise<{ reviewed: boolean; aimResultId: string }> {
  try {
    const record = await store.get(recordId)
    if (!record) return { reviewed: false, aimResultId: "" }
    const parsed = parseFeishuWorkItem(record.fields)
    if (parsed.status === "待人工审核" && parsed.aimResultId.trim()) {
      return { reviewed: true, aimResultId: parsed.aimResultId.trim() }
    }
    return { reviewed: false, aimResultId: "" }
  } catch {
    return { reviewed: false, aimResultId: "" }
  }
}

/**
 * 执行会议洞察工作流。
 *
 * 成功：待处理 → 处理中 → 待人工审核（写结果ID/摘要/链接）。
 * 失败：… → 处理中 → 失败（写可行动错误，不伪造结果）。
 * 幂等：已处于待人工审核且结果一致 → 不重写、不重抽。
 *
 * startWorkItem 失败（如记录不在待处理/处理中）会直接返回，不强行抽取，避免无谓模型调用。
 */
export async function runMeetingInsightWorkflow(
  input: MeetingWorkflowInput,
  ports: MeetingWorkflowPorts,
): Promise<MeetingWorkflowResult> {
  const { store, resultSink } = ports

  // 0. 幂等预检：若已处于待人工审核且已有结果ID，视为本次工作已落定，
  //    不重抽、不重写、不重落盘（避免对同一会议重复消耗模型调用）。
  const existing = await readExistingReview(store, input.recordId)
  if (existing.reviewed) {
    return {
      ok: true,
      status: "待人工审核",
      idempotent: true,
      recordId: input.recordId,
      aimResultId: existing.aimResultId,
    }
  }

  // 1. 进入处理中（待处理→处理中；已处理中幂等）。
  const started = await startWorkItem(store, input.recordId)
  if (!started.ok) {
    return {
      ok: false,
      status: "处理中",
      error: started.error,
      recordId: input.recordId,
    }
  }

  // 领取发生在状态启动之后：启动失败不会永久消耗 maxRunsPerWorkItem；
  // 已进入处理中的并发请求仍由数据库唯一主键原子去重。
  const claim = ports.claimTrace ?? claimAimTrace
  let trace: AimTraceRecorder
  try {
    const claimed = await claim({
      id: buildMeetingInsightTraceId(input.recordId),
      userId: input.actorId,
      projectId: input.projectId,
      agentId: "business_diagnosis",
      action: "generate",
      inputSummary: `sales-diagnosis-v1:${input.recordId}`,
    })
    if (!claimed.acquired) {
      return {
        ok: false,
        status: "处理中",
        error: "该经营事项已有 sales-diagnosis-v1 运行，已抑制重复执行。",
        recordId: input.recordId,
        stopReason: "duplicate_suppressed",
      }
    }
    trace = claimed.trace
  } catch (err) {
    logger.warn({ error: err, recordId: input.recordId }, "[meeting-insight] execution claim failed")
    const message = `销售诊断执行 claim 失败，已 fail-closed：${err instanceof Error ? err.message : String(err)}`
    const failure = await failStartedWorkItem(store, input.recordId, message)
    return { ok: false, ...failure, recordId: input.recordId }
  }

  const markTraceFailed = (error: unknown) => (ports.failTrace ?? failAimTrace)(trace, error)
  const failRun = async (message: string): Promise<Extract<MeetingWorkflowResult, { ok: false }>> => {
    const failure = await failStartedWorkItem(store, input.recordId, message)
    await markTraceFailed(failure.error)
    return { ok: false, ...failure, recordId: input.recordId }
  }

  // 2. 抽取 + 域校验。任一失败 → 写失败 patch 并返回。
  const loop = getRegisteredLoop("sales-diagnosis-v1")
  let run
  try {
    const executeRun = ports.executeRun ?? executeAimRun
    run = await executeRun<MeetingInsightExtractionResult>({
      entrypoint: "generate",
      agentId: "business_diagnosis",
      rawInput: input.transcript,
      targetFormats: ["raw_copy"],
      actorId: input.actorId,
      projectId: input.projectId,
      persistSnapshot: ports.complete ? false : true,
      runLlmQuality: false,
      modelPolicy: {
        temperature: loop.modelPolicy.temperature,
        maxTokens: loop.supervisionPolicy.budget.maxOutputTokens,
        maxProviderAttempts: loop.supervisionPolicy.budget.maxProviderAttempts,
      },
      trace,
    }, async (spec) => ({
      output: await extractMeetingInsightFromTranscript(
        {
          meetingTitle: input.meetingTitle,
          customer: input.customer,
          transcript: input.transcript,
          projectId: input.projectId,
          workItemRecordId: input.recordId,
        },
        { modelPolicy: spec.modelPolicy, complete: ports.complete },
      ),
      contextManifest: [{ kind: "request", id: "meeting_transcript", charCount: input.transcript.length }],
    }))
  } catch (err) {
    const message = `会议洞察 Harness 执行或收尾失败：${err instanceof Error ? err.message : String(err)}`
    return failRun(message)
  }
  const extractResult = run.output

  if (!extractResult.ok) {
    return failRun(extractResult.error)
  }

  const insightResult = extractMeetingInsight(extractResult.input)
  if (!insightResult.ok) {
    return failRun(insightResult.error)
  }

  const verification = verifySalesDiagnosis({
    projectId: input.projectId,
    customer: input.customer,
    meetingTitle: input.meetingTitle,
    transcript: input.transcript,
    insight: insightResult.insight,
  })
  await (ports.addTraceStep ?? addAimTraceStep)(trace, {
    key: "sales_diagnosis_verification",
    label: "销售诊断确定性验证",
    status: verification.status === "fail" ? "failed" : "success",
    summary: verification.summary,
    metadata: {
      policy: loop.verificationPolicy,
      status: verification.status,
      checks: verification.checks,
      evidenceRefs: verification.evidenceRefs,
      nextAction: verification.nextAction,
    },
  })
  if (verification.status === "fail") {
    const failed = await failRun(`${verification.summary} ${verification.nextAction}`)
    return { ...failed, stopReason: "verification_failed" }
  }

  // 3. 落盘完整洞察（结果ID/链接由 resultSink 决定，不建表、不耦合 prisma）。
  let saved: { aimResultId: string; resultLink: string }
  try {
    saved = await resultSink.save({
      insight: insightResult.insight,
      recordId: input.recordId,
      projectId: input.projectId,
      meetingTitle: input.meetingTitle,
      customer: input.customer,
      transcript: input.transcript,
      executionMetadata: run.metadata,
      verification,
      verificationPolicy: loop.verificationPolicy,
    })
  } catch (err) {
    const message = `洞察结果落盘失败：${err instanceof Error ? err.message : String(err)}`
    return failRun(message)
  }

  // 4. 进入待人工审核（带回写结果ID/摘要/链接；WP-3 负责幂等判定）。
  const fields = buildWorkItemReviewFields(insightResult.insight, {
    aimResultId: saved.aimResultId,
    resultLink: saved.resultLink,
  })
  const review = await submitWorkItemForReview(store, input.recordId, {
    aimResultId: String(fields["AIM结果ID"]),
    resultSummary: String(fields["结果摘要"]),
    resultLink: String(fields["结果链接"]),
  })

  if (!review.ok) {
    // submit_review 失败（如非法跳转）按失败处理，写回错误。
    return failRun(review.error)
  }

  await (ports.finishTrace ?? finishAimTrace)(trace, {
    aimGenerationId: saved.aimResultId,
    model: run.metadata.model,
    totalTokens: (run.metadata.inputTokens ?? 0) + (run.metadata.outputTokens ?? 0),
  })

  return {
    ok: true,
    status: "待人工审核",
    idempotent: review.idempotent,
    recordId: input.recordId,
    aimResultId: saved.aimResultId,
    execution: run.metadata,
  }
}
