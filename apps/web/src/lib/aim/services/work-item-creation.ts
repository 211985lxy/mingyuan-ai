/**
 * 经营事项创建（会议纪要 Agent 用）。
 *
 * meeting-insight 管道（runMeetingInsightWorkflow）强制要求 recordId 是飞书经营事项表里
 * 「已存在」的真实记录——startWorkItem 第一步就要读记录并推进状态。WorkItemRecordStore 只有
 * get/transition，没有 create；本模块补上「创建经营事项」这一块，供「录制转写」编排入口在
 * 调用 meeting-insight 之前先建好 record。
 *
 * 复用 feishu-base-publisher 的 upsertBaseRecord（走 +record-upsert，已在 lark-cli 白名单），
 * 不重建第二套飞书客户端。字段名对齐 aim-feishu-work-item.ts 的 MEETING_WORK_ITEM_FIELDS 契约。
 */
import { upsertBaseRecord } from "@/lib/integrations/feishu-base-publisher"
import type { WorkItemStoreConfig } from "@/lib/aim/work-item-store"
import {
  MEETING_WORK_ITEM_FIELDS,
  type WorkItemWorkflow,
} from "@/lib/aim-feishu-work-item"

/** 创建会议经营事项所需输入。 */
export interface CreateMeetingWorkItemInput {
  /** 客户项目 ID（写入「AIM项目ID」，meeting-insight 路由会校验归属）。 */
  projectId: string
  /** 客户名称（写入「客户名称」）。 */
  customer: string
  /** 会议标题（写入「会议标题」）。 */
  meetingTitle: string
  /** 经营事项 Base 配置（来自 readWorkItemStoreConfig）。 */
  config: WorkItemStoreConfig
}

export interface CreatedMeetingWorkItem {
  recordId: string
  created: boolean
}

/**
 * 在飞书经营事项表创建一条「待处理」会议记录，返回 recordId。
 *
 * - 初始状态 = 待处理；工作流 = 销售诊断（会议洞察走 sales-diagnosis-v1 loop）。
 * - 幂等键 = `meeting:<projectId>:<meetingTitle>`，避免对同一会议重复建项。
 * - transcript 暂不写入（meeting-insight 工作流会以参数形式接收，不必落表）。
 */
export async function createMeetingWorkItem(
  input: CreateMeetingWorkItemInput,
): Promise<CreatedMeetingWorkItem> {
  if (!input.projectId.trim()) throw new Error("创建经营事项缺少 projectId。")
  if (!input.customer.trim()) throw new Error("创建经营事项缺少 customer。")
  if (!input.meetingTitle.trim()) throw new Error("创建经营事项缺少 meetingTitle。")

  const workflow: WorkItemWorkflow = "销售诊断"
  const fields: Record<string, unknown> = {
    状态: "待处理",
    工作流: workflow,
    [MEETING_WORK_ITEM_FIELDS.projectId]: input.projectId.trim(),
    [MEETING_WORK_ITEM_FIELDS.meetingTitle]: input.meetingTitle.trim(),
    [MEETING_WORK_ITEM_FIELDS.customer]: input.customer.trim(),
  }

  const result = await upsertBaseRecord({
    baseToken: input.config.baseToken,
    tableId: input.config.tableId,
    fields,
    idempotencyKey: `meeting:${input.projectId}:${input.meetingTitle}`,
    cliPath: input.config.cliPath,
  })
  if (!result.ok || !result.recordId) {
    throw new Error(`创建经营事项失败：${JSON.stringify(result)}`)
  }
  return { recordId: result.recordId, created: result.created }
}
