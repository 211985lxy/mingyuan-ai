import { describe, expect, it, vi } from "vitest"
import {
  listBaseFields,
  filterWritableFields,
  upsertBaseRecord,
  batchUpsertBaseRecords,
  type FeishuBaseFieldInfo,
} from "@/lib/integrations/feishu-base-publisher"

describe("feishu-base-publisher", () => {
  describe("listBaseFields", () => {
    it("解析字段列表并标记可写性", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({
          data: {
            items: [
              { field_name: "标题", type: "text" },
              { field_name: "公式列", type: "formula" },
              { field_name: "查找引用", type: "lookup" },
              { field_name: "创建时间", type: "created_time" },
              { field_name: "状态", type: "single_select" },
            ],
          },
        }),
        stderr: "",
      }))

      const fields = await listBaseFields({
        baseToken: "base_x",
        tableId: "tbl_1",
        runner,
      })

      expect(fields).toHaveLength(5)
      expect(fields.find((f) => f.name === "标题")?.writable).toBe(true)
      expect(fields.find((f) => f.name === "公式列")?.writable).toBe(false)
      expect(fields.find((f) => f.name === "查找引用")?.writable).toBe(false)
      expect(fields.find((f) => f.name === "创建时间")?.writable).toBe(false)
      expect(fields.find((f) => f.name === "状态")?.writable).toBe(true)
    })

    it("空字段列表返回空数组", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ data: { items: [] } }),
        stderr: "",
      }))

      const fields = await listBaseFields({
        baseToken: "base_x",
        tableId: "tbl_1",
        runner,
      })
      expect(fields).toEqual([])
    })
  })

  describe("filterWritableFields", () => {
    it("过滤掉不可写字段", () => {
      const fieldInfos: FeishuBaseFieldInfo[] = [
        { name: "标题", type: "text", writable: true },
        { name: "公式列", type: "formula", writable: false },
        { name: "状态", type: "single_select", writable: true },
      ]
      const fields = { "标题": "测试", "公式列": "=A1", "状态": "进行中", "不存在字段": "x" }
      const filtered = filterWritableFields(fields, fieldInfos)
      expect(filtered).toEqual({ "标题": "测试", "状态": "进行中" })
    })

    it("全部不可写时返回空对象", () => {
      const fieldInfos: FeishuBaseFieldInfo[] = [
        { name: "公式列", type: "formula", writable: false },
      ]
      const fields = { "公式列": "=A1" }
      const filtered = filterWritableFields(fields, fieldInfos)
      expect(filtered).toEqual({})
    })
  })

  describe("upsertBaseRecord", () => {
    it("无幂等键时直接创建", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ record_id: "rec_new" }),
        stderr: "",
      }))

      const result = await upsertBaseRecord({
        baseToken: "base_x",
        tableId: "tbl_1",
        fields: { "标题": "测试" },
        runner,
      })

      expect(result.ok).toBe(true)
      expect(result.recordId).toBe("rec_new")
      expect(result.created).toBe(true)
      expect(runner).toHaveBeenCalledTimes(1)
    })

    it("有幂等键且已存在时更新", async () => {
      let callCount = 0
      const runner = vi.fn(async (_file: string, args: string[]) => {
        callCount++
        if (args.includes("+record-list")) {
          return {
            stdout: JSON.stringify({ data: { items: [{ record_id: "rec_existing" }] } }),
            stderr: "",
          }
        }
        return { stdout: JSON.stringify({ record_id: "rec_existing" }), stderr: "" }
      })

      const result = await upsertBaseRecord({
        baseToken: "base_x",
        tableId: "tbl_1",
        fields: { "标题": "更新" },
        idempotencyKey: "key_123",
        runner,
      })

      expect(result.ok).toBe(true)
      expect(result.recordId).toBe("rec_existing")
      expect(result.created).toBe(false)
      expect(callCount).toBe(2) // 一次查询 + 一次更新
    })

    it("有幂等键但不存在时创建并写入幂等键字段", async () => {
      const runner = vi.fn(async (_file: string, args: string[]) => {
        if (args.includes("+record-list")) {
          return { stdout: JSON.stringify({ data: { items: [] } }), stderr: "" }
        }
        return { stdout: JSON.stringify({ record_id: "rec_new" }), stderr: "" }
      })

      const result = await upsertBaseRecord({
        baseToken: "base_x",
        tableId: "tbl_1",
        fields: { "标题": "新建" },
        idempotencyKey: "key_456",
        runner,
      })

      expect(result.ok).toBe(true)
      expect(result.created).toBe(true)
      // 验证创建时带了幂等键字段
      const lastCall = runner.mock.calls[runner.mock.calls.length - 1]
      const jsonArg = lastCall[1][lastCall[1].indexOf("--json") + 1]
      const parsed = JSON.parse(jsonArg)
      expect(parsed["AIM资产键"]).toBe("key_456")
    })
  })

  describe("batchUpsertBaseRecords", () => {
    it("批量写入并统计", async () => {
      const runner = vi.fn(async () => ({
        stdout: JSON.stringify({ record_id: "rec_batch" }),
        stderr: "",
      }))

      const records = Array.from({ length: 5 }, (_, i) => ({ "标题": `记录${i}` }))
      const result = await batchUpsertBaseRecords({
        baseToken: "base_x",
        tableId: "tbl_1",
        records,
        runner,
      })

      expect(result.ok).toBe(true)
      expect(result.total).toBe(5)
      expect(result.created).toBe(5)
      expect(result.updated).toBe(0)
    })

    it("空记录列表返回零", async () => {
      const runner = vi.fn(async () => ({ stdout: "{}", stderr: "" }))
      const result = await batchUpsertBaseRecords({
        baseToken: "base_x",
        tableId: "tbl_1",
        records: [],
        runner,
      })
      expect(result.total).toBe(0)
      expect(runner).not.toHaveBeenCalled()
    })
  })
})
