/**
 * 渠道绑定字段契约（14 周正本阶段 2）。
 *
 * 冻结 ChannelBinding 必填字段、平台枚举与执行模式；
 * 用于 API / Prisma / 前端类型漂移检查。
 */

import { EXECUTION_MODES, type ExecutionMode } from "@/lib/execution-mode"

export const CHANNEL_BINDING_PLATFORMS = [
  "feishu",
  "workbuddy_wechat",
  "wecom",
] as const

export type ChannelBindingPlatform = (typeof CHANNEL_BINDING_PLATFORMS)[number]

export const CHANNEL_BINDING_TRIGGER_MODES = [
  "mention_or_keyword",
  "all",
] as const

export type ChannelBindingTriggerMode = (typeof CHANNEL_BINDING_TRIGGER_MODES)[number]

export const CHANNEL_BINDING_ROUTE_TARGETS = ["topic", "aim"] as const

export type ChannelBindingRouteTarget = (typeof CHANNEL_BINDING_ROUTE_TARGETS)[number]

export const CHANNEL_BINDING_STATUSES = ["active", "disabled"] as const

export type ChannelBindingStatus = (typeof CHANNEL_BINDING_STATUSES)[number]

/** Prisma ChannelBinding + API 共用必填字段名。 */
export const CHANNEL_BINDING_REQUIRED_FIELDS = [
  "id",
  "platform",
  "externalChatId",
  "userId",
  "projectId",
  "triggerMode",
  "triggerKeywords",
  "executionMode",
  "routeTarget",
  "status",
] as const

/** 创建/更新 API 可写字段（不含 id/userId/时间戳）。 */
export const CHANNEL_BINDING_WRITABLE_FIELDS = [
  "platform",
  "externalChatId",
  "externalAccountId",
  "projectId",
  "triggerMode",
  "triggerKeywords",
  "executionMode",
  "routeTarget",
  "defaultAgentId",
  "status",
] as const

export const CHANNEL_BINDING_EXECUTION_MODES: readonly ExecutionMode[] = EXECUTION_MODES

export interface ChannelBindingFieldContractResult {
  ok: boolean
  missing: string[]
  invalidEnums: string[]
}

/**
 * @description 检查一条渠道绑定记录是否满足字段与枚举契约
 */
export function checkChannelBindingFieldContract(
  record: Record<string, unknown>,
): ChannelBindingFieldContractResult {
  const missing = CHANNEL_BINDING_REQUIRED_FIELDS.filter((field) => {
    const value = record[field]
    if (value == null) return true
    if (typeof value === "string" && !value.trim()) return true
    if (field === "triggerKeywords" && !Array.isArray(value)) return true
    return false
  })

  const invalidEnums: string[] = []
  if (
    typeof record.platform === "string" &&
    !(CHANNEL_BINDING_PLATFORMS as readonly string[]).includes(record.platform)
  ) {
    invalidEnums.push(`platform=${record.platform}`)
  }
  if (
    typeof record.executionMode === "string" &&
    !(CHANNEL_BINDING_EXECUTION_MODES as readonly string[]).includes(record.executionMode)
  ) {
    invalidEnums.push(`executionMode=${record.executionMode}`)
  }
  if (
    typeof record.triggerMode === "string" &&
    !(CHANNEL_BINDING_TRIGGER_MODES as readonly string[]).includes(record.triggerMode)
  ) {
    invalidEnums.push(`triggerMode=${record.triggerMode}`)
  }
  if (
    typeof record.routeTarget === "string" &&
    !(CHANNEL_BINDING_ROUTE_TARGETS as readonly string[]).includes(record.routeTarget)
  ) {
    invalidEnums.push(`routeTarget=${record.routeTarget}`)
  }
  if (
    typeof record.status === "string" &&
    !(CHANNEL_BINDING_STATUSES as readonly string[]).includes(record.status)
  ) {
    invalidEnums.push(`status=${record.status}`)
  }

  return {
    ok: missing.length === 0 && invalidEnums.length === 0,
    missing: [...missing],
    invalidEnums,
  }
}

/**
 * @description 断言 API 写入字段集合未漂移出契约
 */
export function assertChannelBindingWritableFieldsAligned(
  actualKeys: readonly string[],
): void {
  const allowed = new Set<string>(CHANNEL_BINDING_WRITABLE_FIELDS)
  for (const key of actualKeys) {
    if (!allowed.has(key)) {
      throw new Error(`ChannelBinding API 字段未纳入契约: ${key}`)
    }
  }
  for (const required of ["platform", "externalChatId", "projectId", "executionMode"] as const) {
    if (!actualKeys.includes(required) && !CHANNEL_BINDING_WRITABLE_FIELDS.includes(required)) {
      throw new Error(`ChannelBinding 契约缺少关键写入字段: ${required}`)
    }
  }
}
