import { Prisma } from "@/generated/prisma/client"
import {
  assertWorkflowTransition,
  isAimWorkflowStatus,
  type AimWorkflowStatus,
} from "@/lib/aim/workflow-status"

const VALID_WORKFLOW_STATUS = new Set([
  "draft",
  "pending_review",
  "ready_to_shoot",
  "shooting",
  "editing",
  "ready_to_publish",
  "published",
  "archived",
])

type JsonRecord = Record<string, unknown>

interface ExistingHistorySnapshots {
  retroSnapshots: unknown
  calibrationRules: unknown
  decisionSnapshot: unknown
  workflowStatus?: string | null
}

type ParsedHistoryUpdate =
  | { ok: true; data: ReturnType<typeof normalizeHistoryUpdate> }
  | { ok: false; error: string }

function isRecordObject(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readJsonArray(value: unknown): JsonRecord[] {
  return Array.isArray(value) ? value.filter(isRecordObject) : []
}

function normalizeDecisionSnapshot(value: unknown, createdAt: string) {
  if (!isRecordObject(value)) return undefined
  return {
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 2000) : "",
    targetUser: typeof value.targetUser === "string" ? value.targetUser.trim().slice(0, 500) : undefined,
    expectedSignal: typeof value.expectedSignal === "string"
      ? value.expectedSignal.trim().slice(0, 1000)
      : undefined,
    confidence: typeof value.confidence === "string" ? value.confidence.trim().slice(0, 100) : undefined,
    createdAt,
  }
}

function normalizeRetroSnapshot(value: unknown, createdAt: string) {
  if (!isRecordObject(value)) return undefined
  return {
    summary: typeof value.summary === "string" ? value.summary.trim().slice(0, 2000) : "",
    actualData: typeof value.actualData === "string" ? value.actualData.trim().slice(0, 2000) : undefined,
    verdict: typeof value.verdict === "string" ? value.verdict.trim().slice(0, 500) : undefined,
    nextRule: typeof value.nextRule === "string" ? value.nextRule.trim().slice(0, 1000) : undefined,
    createdAt,
  }
}

function normalizeCalibrationRule(value: unknown, createdAt: string) {
  if (!isRecordObject(value)) return undefined
  return {
    rule: typeof value.rule === "string" ? value.rule.trim().slice(0, 1000) : "",
    source: typeof value.source === "string" ? value.source.trim().slice(0, 300) : undefined,
    createdAt,
  }
}

function normalizeHistoryUpdate(body: JsonRecord, createdAt: string) {
  return {
    workflowStatus: typeof body.workflowStatus === "string" && VALID_WORKFLOW_STATUS.has(body.workflowStatus)
      ? body.workflowStatus
      : undefined,
    reviewNote: typeof body.reviewNote === "string" ? body.reviewNote.trim().slice(0, 2000) : undefined,
    publishPlatform: typeof body.publishPlatform === "string"
      ? body.publishPlatform.trim().slice(0, 50)
      : undefined,
    publishUrl: typeof body.publishUrl === "string" ? body.publishUrl.trim().slice(0, 2000) : undefined,
    decisionSnapshot: normalizeDecisionSnapshot(body.decisionSnapshot, createdAt),
    retroSnapshot: normalizeRetroSnapshot(body.retroSnapshot, createdAt),
    calibrationRule: normalizeCalibrationRule(body.calibrationRule, createdAt),
  }
}

/**
 * @description 解析aimhistoryupdate
 * @param body - 请求体
 * @param createdAt - createdAt
 * @param options.fromStatus - 当前状态（用于转换校验）
 * @param options.existingPublishPlatform - 已登记平台（进入 published 时可复用）
 * @returns ParsedHistoryUpdate
 */
export function parseAimHistoryUpdate(
  body: unknown,
  createdAt = new Date().toISOString(),
  options?: { fromStatus?: string | null; existingPublishPlatform?: string | null },
): ParsedHistoryUpdate {
  const data = normalizeHistoryUpdate(isRecordObject(body) ? body : {}, createdAt)
  if (data.decisionSnapshot && !data.decisionSnapshot.summary) {
    return { ok: false, error: "发布前判断不能为空" }
  }
  if (data.retroSnapshot && !data.retroSnapshot.summary) {
    return { ok: false, error: "复盘结论不能为空" }
  }
  if (data.calibrationRule && !data.calibrationRule.rule) {
    return { ok: false, error: "下次判断规则不能为空" }
  }
  if (data.workflowStatus) {
    if (!isAimWorkflowStatus(data.workflowStatus)) {
      return { ok: false, error: `无效工作流状态：${data.workflowStatus}` }
    }
    const transition = assertWorkflowTransition({
      from: options?.fromStatus,
      to: data.workflowStatus,
      publishPlatform: data.publishPlatform ?? options?.existingPublishPlatform,
      publishUrl: data.publishUrl,
    })
    if (!transition.ok) return { ok: false, error: transition.error }
  }
  return { ok: true, data }
}

/**
 * @description 构建aimhistoryupdatedata
 * @param input - 输入数据
 * @param existing - existing
 * @returns 无返回值
 */
export function buildAimHistoryUpdateData(
  input: ReturnType<typeof normalizeHistoryUpdate>,
  existing: ExistingHistorySnapshots,
) {
  return {
    workflowStatus: input.workflowStatus,
    reviewNote: input.reviewNote,
    publishedAt: input.workflowStatus === "published" ? new Date() : undefined,
    publishPlatform: input.publishPlatform,
    publishUrl: input.publishUrl,
    decisionSnapshot: input.decisionSnapshot
      ? (isRecordObject(existing.decisionSnapshot)
          ? existing.decisionSnapshot as Prisma.InputJsonValue
          : input.decisionSnapshot)
      : undefined,
    retroSnapshots: input.retroSnapshot
      ? ([...readJsonArray(existing.retroSnapshots), input.retroSnapshot] as Prisma.InputJsonValue)
      : undefined,
    calibrationRules: input.calibrationRule
      ? ([...readJsonArray(existing.calibrationRules), input.calibrationRule] as Prisma.InputJsonValue)
      : undefined,
  }
}
