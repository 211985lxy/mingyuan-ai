/**
 * 飞书领取事项写入（仅服务端）
 * 拆出避免客户端 bundle 拉入 node:child_process。
 */

import {
  buildFeishuWorkItemOpenUrl,
  type ContentDistributionClaimDraft,
} from "@/lib/aim/content-distribution-claim"
import {
  readWorkItemStoreConfig,
  type WorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import { upsertBaseRecord } from "@/lib/integrations/feishu-base-publisher"

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
      connectorStatus: "disabled"
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
      connectorStatus: "disabled",
      reason: error instanceof Error ? error.message : "飞书经营事项未配置",
    }
  }

  try {
    const upsert = input.upsert || upsertBaseRecord
    const result = await upsert({
      baseToken: config.baseToken,
      tableId: config.tableId,
      fields: draft.feishuFields,
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
