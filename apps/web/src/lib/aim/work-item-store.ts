/**
 * 经营事项读写 store 适配层（WP-4）。
 *
 * 把 WP-3 的 `WorkItemRecordStore`（依赖注入端口）绑定到真实的飞书 Base
 * 记录级能力：getLarkBaseRecord / updateLarkBaseRecord。
 *
 * 边界（对齐 docs/plans/...zcode-execution-plan.md §14）：
 * - 真实 Base 与表来自环境变量：LARK_BASE_TOKEN / LARK_WORK_ITEM_TABLE_ID / LARK_CLI_PATH。
 * - 缺任一配置即抛错（fail-fast），由 route 转为 503，不伪造默认表（零 Mock 铁律）。
 * - 只复用 lark-base-tool.ts 的 record 级函数，不重建第二套飞书客户端。
 */
import {
  getLarkBaseRecord,
  updateLarkBaseRecord,
} from "@/lib/lark-base-tool"
import type { WorkItemRecordStore } from "@/lib/aim/services/work-item-execution"

/** 环境变量形态（process.env 的最小投影，便于注入测试）。 */
type EnvLike = Record<string, string | undefined>

export interface WorkItemStoreConfig {
  baseToken: string
  tableId: string
  cliPath: string
}

/**
 * 从环境变量读取经营事项 Base 配置；任一关键项缺失即抛错。
 * 缺 LARK_WORK_ITEM_TABLE_ID 时不退回到其它表，避免写错表（WP-5 未核对前尤其重要）。
 */
export function readWorkItemStoreConfig(env: EnvLike = process.env): WorkItemStoreConfig {
  const baseToken = env.LARK_BASE_TOKEN?.trim()
  const tableId = env.LARK_WORK_ITEM_TABLE_ID?.trim()
  const cliPath = env.LARK_CLI_PATH?.trim()
  if (!baseToken) throw new Error("经营事项入口缺少 LARK_BASE_TOKEN 配置。")
  if (!tableId) throw new Error("经营事项入口缺少 LARK_WORK_ITEM_TABLE_ID 配置（WP-5 真实联调后填入）。")
  if (!cliPath) throw new Error("经营事项入口缺少 LARK_CLI_PATH 配置。")
  return { baseToken, tableId, cliPath }
}

/**
 * 构造一个绑定到真实飞书 Base 的经营事项 store。
 * get：记录缺失时 lark-base-tool 抛错，交由 WP-3 服务转 ok:false。
 */
export function createLarkWorkItemStore(config: WorkItemStoreConfig): WorkItemRecordStore {
  return {
    async get(recordId) {
      const { recordId: id, fields } = await getLarkBaseRecord({
        baseToken: config.baseToken,
        tableId: config.tableId,
        recordId,
        cliPath: config.cliPath,
        identity: "bot",
      })
      return { recordId: id, fields }
    },
    async update(recordId, fields) {
      await updateLarkBaseRecord({
        baseToken: config.baseToken,
        tableId: config.tableId,
        recordId,
        fields,
        cliPath: config.cliPath,
        identity: "bot",
      })
      return { ok: true }
    },
  }
}
