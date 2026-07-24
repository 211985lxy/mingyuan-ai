/**
 * 飞书经营事项字段契约（缺口升级 WP-B1）。
 *
 * 生产表必须包含本清单全部字段名；代码侧常量与本清单双向对齐。
 * 真实联调仍须用 lark-cli field-list 核对类型，本模块只锁「字段名集合」。
 */

import { DISPATCH_FIELDS, SUPERVISION_FIELDS } from "@/lib/aim/work-item-dispatch"

/** 核心业务字段（WP-2 parseFeishuWorkItem 读取）。 */
export const WORK_ITEM_CORE_FIELD_NAMES = [
  "状态",
  "工作流",
  "AIM项目ID",
  "输入内容",
  "AIM结果ID",
  "结果摘要",
  "结果链接",
  "错误信息",
  "LoopID",
  "Loop版本",
  "最后运行ID",
  "负责人",
  "最后处理时间",
  "事项名称",
] as const

/** 调度租约 / 重试字段（WP-8）。 */
export const WORK_ITEM_DISPATCH_FIELD_NAMES = [
  DISPATCH_FIELDS.leaseUntil,
  DISPATCH_FIELDS.leaseHolder,
  DISPATCH_FIELDS.retryCount,
  DISPATCH_FIELDS.nextRetryAt,
  DISPATCH_FIELDS.needsHuman,
  DISPATCH_FIELDS.stopReason,
  DISPATCH_FIELDS.nextAction,
  DISPATCH_FIELDS.lastRunId,
] as const

/** 监督步骤字段。 */
export const WORK_ITEM_SUPERVISION_FIELD_NAMES = [
  SUPERVISION_FIELDS.currentStep,
  SUPERVISION_FIELDS.verificationStatus,
  SUPERVISION_FIELDS.verificationSummary,
] as const

/** 生产启用 live / supervised_auto 前必须存在的字段全集。 */
export const WORK_ITEM_REQUIRED_PRODUCTION_FIELDS: readonly string[] = Object.freeze([
  ...new Set<string>([
    ...WORK_ITEM_CORE_FIELD_NAMES,
    ...WORK_ITEM_DISPATCH_FIELD_NAMES,
    ...WORK_ITEM_SUPERVISION_FIELD_NAMES,
  ]),
])

export interface WorkItemFieldContractResult {
  ok: boolean
  missing: string[]
  /** 表上多出来的字段不视为失败，仅供审计 */
  extra: string[]
}

/**
 * @description 对照真实表字段名，检查生产契约是否满足
 */
export function checkWorkItemFieldContract(
  actualFieldNames: readonly string[],
): WorkItemFieldContractResult {
  const actual = new Set(
    actualFieldNames.map((name) => name.trim()).filter(Boolean),
  )
  const missing = WORK_ITEM_REQUIRED_PRODUCTION_FIELDS.filter((name) => !actual.has(name))
  const required = new Set(WORK_ITEM_REQUIRED_PRODUCTION_FIELDS)
  const extra = [...actual].filter((name) => !required.has(name)).sort()
  return { ok: missing.length === 0, missing: [...missing], extra }
}

/**
 * @description 断言代码内 DISPATCH/SUPERVISION 常量未漂移出契约清单
 */
export function assertDispatchFieldsInContract(): void {
  for (const name of Object.values(DISPATCH_FIELDS)) {
    if (!WORK_ITEM_REQUIRED_PRODUCTION_FIELDS.includes(name)) {
      throw new Error(`DISPATCH_FIELDS 值未纳入生产契约: ${name}`)
    }
  }
  for (const name of Object.values(SUPERVISION_FIELDS)) {
    if (!WORK_ITEM_REQUIRED_PRODUCTION_FIELDS.includes(name)) {
      throw new Error(`SUPERVISION_FIELDS 值未纳入生产契约: ${name}`)
    }
  }
}
