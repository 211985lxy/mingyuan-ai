import { describe, expect, it } from "vitest"
import {
  createShadowWorkItemStore,
  listPendingWorkItemRecords,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"

const VALID_ENV = {
  LARK_BASE_TOKEN: "base_1",
  LARK_WORK_ITEM_TABLE_ID: "table_1",
  LARK_CLI_PATH: "/usr/local/bin/lark-cli",
}

describe("readWorkItemStoreConfig", () => {
  it("reads the complete Feishu work-item configuration", () => {
    expect(readWorkItemStoreConfig(VALID_ENV)).toEqual({
      baseToken: "base_1",
      tableId: "table_1",
      cliPath: "/usr/local/bin/lark-cli",
    })
  })

  it.each([
    ["LARK_BASE_TOKEN", "LARK_BASE_TOKEN"],
    ["LARK_WORK_ITEM_TABLE_ID", "LARK_WORK_ITEM_TABLE_ID"],
    ["LARK_CLI_PATH", "LARK_CLI_PATH"],
  ] as const)("fails closed when %s is missing", (key, message) => {
    expect(() => readWorkItemStoreConfig({ ...VALID_ENV, [key]: "" })).toThrow(message)
  })
})

describe("listPendingWorkItemRecords", () => {
  const CONFIG = {
    baseToken: "base_1",
    tableId: "table_1",
    cliPath: "/usr/local/bin/lark-cli",
  }

  function runnerReturning(items: Array<{ record_id: string; fields: Record<string, unknown> }>) {
    return async () => ({ data: { items } })
  }

  it("只返回状态机可解析为「待处理」的记录", async () => {
    const records = await listPendingWorkItemRecords(
      CONFIG,
      20,
      runnerReturning([
        { record_id: "rec_1", fields: { 状态: "待处理" } },
        { record_id: "rec_2", fields: { 状态: "处理中" } },
        { record_id: "rec_3", fields: { 状态: "待人工审核" } },
        { record_id: "rec_4", fields: { 状态: "待处理" } },
        { record_id: "rec_5", fields: { 状态: "莫名其妙" } },
      ]),
    )
    expect(records.map((r) => r.recordId)).toEqual(["rec_1", "rec_4"])
  })

  it("兼容 lark-cli bot 身份返回的字段矩阵", async () => {
    const records = await listPendingWorkItemRecords(CONFIG, 20, async () => ({
      ok: true,
      identity: "bot",
      data: {
        data: [
          ["灰度任务", ["待处理"], "project_1"],
          ["已启动任务", ["处理中"], "project_2"],
        ],
        fields: ["事项名称", "状态", "AIM项目ID"],
        record_id_list: ["rec_shadow", "rec_running"],
      },
    }))

    expect(records).toEqual([{
      recordId: "rec_shadow",
      fields: {
        事项名称: "灰度任务",
        状态: ["待处理"],
        AIM项目ID: "project_1",
      },
    }])
  })

  it("空表返回空数组，不伪造记录", async () => {
    const records = await listPendingWorkItemRecords(CONFIG, 20, runnerReturning([]))
    expect(records).toEqual([])
  })

  it("limit 收敛到 1–100 并传给底层命令", async () => {
    const calls: string[][] = []
    await listPendingWorkItemRecords(CONFIG, 500, async (_command, args) => {
      calls.push(args)
      return { data: { items: [] } }
    })
    const limitIndex = calls[0].indexOf("--limit")
    expect(calls[0][limitIndex + 1]).toBe("100")
  })
})

describe("createShadowWorkItemStore", () => {
  it("读取真实记录但状态更新只保留在影子内存", async () => {
    const realRecord = { recordId: "rec_1", fields: { 状态: "待处理", 标题: "真实任务" } }
    const realStore = {
      async get() { return realRecord },
      async update() { throw new Error("影子模式不应写真实飞书") },
    }
    const shadow = createShadowWorkItemStore(realStore)
    await shadow.update("rec_1", { 状态: "处理中" })
    expect((await shadow.get("rec_1"))?.fields["状态"]).toBe("处理中")
    expect(realRecord.fields["状态"]).toBe("待处理")
  })
})
