/**
 * 飞书经营事项执行服务（WP-3）。
 *
 * 在 WP-2 纯领域模块（状态机 + 字段解析 + patch 构造）之上，封装经营事项的
 * “开始 / 提交审核 / 完成 / 失败”四个执行动作。每个动作 = 读原记录 → 解析 →
 * 状态转换（幂等感知）→ 仅在状态真正变化时回写一条 patch。
 *
 * 设计目标见 docs/plans/aim-ai-native-company-zcode-execution-plan.md §10：
 * - 相同请求幂等：幂等命中时不产生回写，避免无意义写入与重复创建结果。
 * - 失败可回写：失败动作把可行动错误写回原记录（按 record_id），不伪造结果。
 * - 不丢错误：记录缺失、状态未知、端口抛错一律以 ok:false 返回，绝不静默吞掉。
 *
 * 依赖边界（对齐 §5 与零 Mock 铁律）：
 * - 不直接 import lark-cli / lark-base-tool；真实飞书读写由调用方注入 store 端口。
 * - 不重复定义状态机——全部复用 `@/lib/aim-feishu-work-item`。
 * - 不调用 prisma，不接触 UI，不新增 API 路由（路由与真实飞书绑定见 WP-4 / WP-5）。
 */

import {
  buildCompletePatch,
  buildFailPatch,
  buildReviewPatch,
  buildRetryPatch,
  buildStartPatch,
  parseFeishuWorkItem,
  transitionWorkItem,
  type ParsedWorkItem,
  type WorkItemStatus,
} from "@/lib/aim-feishu-work-item"

/** 一条飞书经营事项记录的最小可读写投影（record_id + fields）。 */
export interface WorkItemRecord {
  recordId: string
  fields: Record<string, unknown>
}

/**
 * 经营事项读写端口（依赖注入）。真实实现把 get/update 绑定到
 * getLarkBaseRecord / updateLarkBaseRecord（WP-5），测试用内存 stub。
 * 写入语义：update 按给定 record_id 原记录回写 patch，不新建平行记录。
 */
export interface WorkItemRecordStore {
  get(recordId: string): Promise<WorkItemRecord | null>
  update(
    recordId: string,
    fields: Record<string, unknown>,
  ): Promise<{ ok: true }>
}

/** 统一返回：成功带状态与幂等标志，失败带可行动错误。 */
export type WorkItemExecutionResult =
  | { ok: true; status: WorkItemStatus; idempotent: boolean; recordId: string }
  | { ok: false; error: string }

/**
 * 读记录 → 解析 → 按目标状态与 patch 构造器推进。
 * - 幂等（已处于目标状态）：ok 且不带 patch，调用方据此跳过回写。
 * - 记录缺失 / 状态未知 / 非法跳转 / 端口抛错：ok:false，错误不丢失。
 */
async function applyTransition(
  store: WorkItemRecordStore,
  recordId: string,
  target: WorkItemStatus,
  buildPatch: () => Record<string, unknown>,
  isSameRequest: (item: ParsedWorkItem) => boolean = () => true,
): Promise<WorkItemExecutionResult> {
  let record: WorkItemRecord | null
  try {
    record = await store.get(recordId)
  } catch (err) {
    return { ok: false, error: `读取经营事项失败：${describeError(err)}` }
  }
  if (!record) {
    return { ok: false, error: `经营事项记录不存在：${recordId}。请核对 record_id 与表归属。` }
  }

  const parsed = parseFeishuWorkItem(record.fields)
  if (!parsed.status) {
    return {
      ok: false,
      error: `经营事项状态不可执行（recordId=${recordId}，rawStatus=${parsed.rawStatus || "空"}）；` +
        `需先在飞书把状态收敛为待处理/处理中/待人工审核之一。`,
    }
  }

  const result = transitionWorkItem({ status: parsed.status }, target)
  if (!result.ok) {
    return result
  }

  // 幂等：状态未变，不回写，避免无意义写入与重复创建结果记录。
  if (result.idempotent) {
    if (!isSameRequest(parsed)) {
      return {
        ok: false,
        error: `经营事项已处于${target}，但本次请求内容与原记录不一致；请核对 AIM结果ID、摘要或错误信息。`,
      }
    }
    return { ok: true, status: result.status, idempotent: true, recordId }
  }

  let patch: Record<string, unknown>
  try {
    patch = buildPatch()
  } catch (err) {
    return { ok: false, error: describeError(err) }
  }

  try {
    await store.update(recordId, patch)
  } catch (err) {
    return { ok: false, error: `回写经营事项失败：${describeError(err)}` }
  }
  return { ok: true, status: result.status, idempotent: false, recordId }
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/**
 * 开始处理：待处理 → 处理中。已是处理中视为幂等，不重写。
 */
export function startWorkItem(
  store: WorkItemRecordStore,
  recordId: string,
): Promise<WorkItemExecutionResult> {
  return applyTransition(store, recordId, "处理中", buildStartPatch)
}

export interface SubmitReviewInput {
  aimResultId: string
  resultSummary: string
  resultLink: string
}

/**
 * 提交审核：处理中 → 待人工审核，带回写 AIM 结果。
 * 必须有 aimResultId；已处于待人工审核视为幂等。
 */
export function submitWorkItemForReview(
  store: WorkItemRecordStore,
  recordId: string,
  input: SubmitReviewInput,
): Promise<WorkItemExecutionResult> {
  return applyTransition(store, recordId, "待人工审核", () =>
    buildReviewPatch({
      aimResultId: input.aimResultId,
      resultSummary: input.resultSummary,
      resultLink: input.resultLink,
    }),
    (item) =>
      item.aimResultId === input.aimResultId.trim() &&
      item.resultSummary === input.resultSummary.trim() &&
      item.resultLink === input.resultLink.trim(),
  )
}

export interface CompleteWorkItemInput {
  aimResultId: string
  resultSummary: string
}

/**
 * 完成：待人工审核 → 已完成，清空旧错误信息。已完成为终态，重复完成幂等。
 */
export function completeWorkItem(
  store: WorkItemRecordStore,
  recordId: string,
  input: CompleteWorkItemInput,
): Promise<WorkItemExecutionResult> {
  return applyTransition(store, recordId, "已完成", () =>
    buildCompletePatch({
      aimResultId: input.aimResultId,
      resultSummary: input.resultSummary,
    }),
    (item) =>
      item.aimResultId === input.aimResultId.trim() &&
      item.resultSummary === input.resultSummary.trim(),
  )
}

export interface FailWorkItemInput {
  errorMessage: string
}

/**
 * 失败：处理中 → 失败，写入可行动错误信息（按 record_id 回写原记录，不伪造结果）。
 */
export function failWorkItem(
  store: WorkItemRecordStore,
  recordId: string,
  input: FailWorkItemInput,
): Promise<WorkItemExecutionResult> {
  return applyTransition(store, recordId, "失败", () =>
    buildFailPatch({ errorMessage: input.errorMessage }),
    (item) => item.errorMessage === input.errorMessage.trim(),
  )
}

/** 重试：失败 → 待处理。必须先显式失败，禁止从处理中直接跳回待处理。 */
export function retryWorkItem(
  store: WorkItemRecordStore,
  recordId: string,
): Promise<WorkItemExecutionResult> {
  return applyTransition(store, recordId, "待处理", buildRetryPatch)
}
