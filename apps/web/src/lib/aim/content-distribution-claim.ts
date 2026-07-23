/**
 * 内容包飞书领取事项（阶段 5 WP5.1）
 * AiM 为正本；飞书经营事项为领取协作正本。
 * 复用现有 upsertBaseRecord + 经营事项表字段契约，不新建 Agent / 表结构。
 */

import { CONTENT_PACKAGE_FORMAT_LABELS, getContentPackageFromTaskSpec } from "@/lib/content-package-spec"
import { getCanonicalFromTaskSpec } from "@/lib/canonical-content-spec"
import type { TaskSpec } from "@/lib/task-spec"
import type { ContentFormat } from "@/lib/aim-generator"
import {
  readWorkItemStoreConfig,
  type WorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import { upsertBaseRecord } from "@/lib/integrations/feishu-base-publisher"

export interface ContentDistributionClaimDraft {
  workflow: "内容增长"
  status: "待处理"
  contentPackageName: string
  projectId: string | null
  platforms: string[]
  assigneeHint: string
  dueAtHint: string
  reviewStatus: string
  aimContentLink: string
  publishLink: string
  publishResultHint: string
  plainText: string
  /** 飞书经营事项可写字段（对齐 aim-feishu-work-item 字段名） */
  feishuFields: Record<string, unknown>
  /** 幂等键：同一 generation 重复提交更新同一条领取事项 */
  idempotencyKey: string
}

/**
 * @description 生成飞书领取事项草稿（确定性，无 LLM）
 */
export function buildContentDistributionClaimDraft(input: {
  generationId: string
  projectId?: string | null
  projectName?: string | null
  taskSpec?: TaskSpec | null
  formats?: ContentFormat[]
  aimBaseUrl?: string
  publishUrl?: string | null
  publishPlatform?: string | null
}): ContentDistributionClaimDraft {
  const canonical = getCanonicalFromTaskSpec(input.taskSpec)
  const contentPackage = getContentPackageFromTaskSpec(input.taskSpec)
  const formats =
    input.formats?.length
      ? input.formats
      : contentPackage?.completedFormats?.length
        ? contentPackage.completedFormats
        : (["video_script"] as ContentFormat[])
  const name =
    canonical?.coreMessage?.trim().slice(0, 40) ||
    `内容包 ${input.generationId.slice(0, 8)}`
  const platforms = formats.map(
    (format) =>
      CONTENT_PACKAGE_FORMAT_LABELS[format as keyof typeof CONTENT_PACKAGE_FORMAT_LABELS] || format,
  )
  const aimBase = (input.aimBaseUrl || "").replace(/\/$/, "")
  const aimContentLink = aimBase
    ? `${aimBase}/aim?generationId=${encodeURIComponent(input.generationId)}`
    : `aim://generation/${input.generationId}`
  const publishLink = input.publishUrl?.trim() || ""
  const inputContent = [
    `内容包：${name}`,
    `项目：${input.projectName || input.projectId || "（未绑定）"}`,
    `平台：${platforms.join("、")}`,
    `审核状态：${canonical?.status === "confirmed" ? "母内容已确认" : "待确认母内容"}`,
    `AiM 内容链接：${aimContentLink}`,
    publishLink ? `发布链接：${publishLink}` : "发布链接：（发布后回填）",
    "领取后按时发布，并回填平台链接与 7/14/30 天经营结果。",
  ].join("\n")

  const feishuFields: Record<string, unknown> = {
    工作流: "内容增长",
    状态: "待处理",
    AIM项目ID: input.projectId || "",
    输入内容: inputContent,
    AIM结果ID: input.generationId,
    结果摘要: name,
    结果链接: aimContentLink,
  }

  const draft: ContentDistributionClaimDraft = {
    workflow: "内容增长",
    status: "待处理",
    contentPackageName: name,
    projectId: input.projectId ?? null,
    platforms,
    assigneeHint: "（待指定领取人）",
    dueAtHint: "（待填截止时间）",
    reviewStatus: canonical?.status === "confirmed" ? "母内容已确认" : "待确认母内容",
    aimContentLink,
    publishLink: publishLink || "（发布后回填）",
    publishResultHint: "发布后回填平台链接与 7/14/30 天经营结果",
    plainText: "",
    feishuFields,
    idempotencyKey: `content-claim:${input.generationId}`,
  }

  draft.plainText = [
    "【飞书领取事项草稿·内容增长】",
    `状态：${draft.status}`,
    `内容包：${draft.contentPackageName}`,
    `项目：${input.projectName || input.projectId || "（未绑定）"}`,
    `平台：${platforms.join("、")}`,
    `领取人：${draft.assigneeHint}`,
    `截止时间：${draft.dueAtHint}`,
    `审核状态：${draft.reviewStatus}`,
    `AiM 内容链接：${draft.aimContentLink}`,
    `发布链接：${draft.publishLink}`,
    `发布结果：${draft.publishResultHint}`,
    "",
    "说明：AiM 保存内容与结果正本；飞书保存领取与负责人正本。",
  ].join("\n")

  return draft
}

/**
 * @description 构造飞书经营事项 Base 打开链接
 */
export function buildFeishuWorkItemOpenUrl(input: {
  baseToken: string
  tableId: string
  recordId?: string | null
}): string {
  const base = `https://feishu.cn/base/${encodeURIComponent(input.baseToken)}?table=${encodeURIComponent(input.tableId)}`
  return input.recordId
    ? `${base}&record=${encodeURIComponent(input.recordId)}`
    : base
}

export type SubmitContentDistributionClaimResult =
  | {
      ok: true
      created: boolean
      recordId: string
      openUrl: string
      draft: ContentDistributionClaimDraft
      mode: "feishu_upsert"
    }
  | {
      ok: true
      created: false
      recordId: null
      openUrl: string | null
      draft: ContentDistributionClaimDraft
      mode: "copy_only"
      reason: string
    }
  | { ok: false; error: string; draft?: ContentDistributionClaimDraft }

/**
 * @description 一键写入飞书经营事项（配置缺失时回退为仅草稿，不伪造成功）
 */
export async function submitContentDistributionClaim(input: {
  draft: ContentDistributionClaimDraft
  env?: Record<string, string | undefined>
  upsert?: typeof upsertBaseRecord
  readConfig?: (env?: Record<string, string | undefined>) => WorkItemStoreConfig
}): Promise<SubmitContentDistributionClaimResult> {
  const draft = input.draft
  let config: WorkItemStoreConfig
  try {
    config = (input.readConfig || readWorkItemStoreConfig)(input.env)
  } catch (error) {
    return {
      ok: true,
      created: false,
      recordId: null,
      openUrl: null,
      draft,
      mode: "copy_only",
      reason: error instanceof Error ? error.message : "飞书经营事项未配置",
    }
  }

  try {
    const upsert = input.upsert || upsertBaseRecord
    const result = await upsert({
      baseToken: config.baseToken,
      tableId: config.tableId,
      fields: draft.feishuFields,
      // 经营事项表已有 AIM结果ID（见 aim-feishu-work-item），不依赖资产落地专用「AIM资产键」
      idempotencyField: "AIM结果ID",
      idempotencyKey: String(draft.feishuFields["AIM结果ID"] || "").trim() || draft.idempotencyKey,
      identity: "bot",
      cliPath: config.cliPath,
    })
    return {
      ok: true,
      created: result.created,
      recordId: result.recordId,
      openUrl: buildFeishuWorkItemOpenUrl({
        baseToken: config.baseToken,
        tableId: config.tableId,
        recordId: result.recordId,
      }),
      draft,
      mode: "feishu_upsert",
    }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "写入飞书经营事项失败",
      draft,
    }
  }
}
