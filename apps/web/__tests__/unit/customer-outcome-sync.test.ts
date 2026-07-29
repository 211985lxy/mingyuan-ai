import { describe, expect, it, vi } from "vitest"
import { CUSTOMER_OUTCOME_FIELD_NAMES } from "@/lib/aim/customer-outcome-field-contract"
import {
  loadCustomerOutcomeSource,
  syncCustomerOutcomeProjections,
} from "@/lib/aim/customer-outcome-sync"
import type {
  CustomerOutcomeProjectionRecord,
  CustomerOutcomeProjectionStorePort,
} from "@/lib/aim/customer-outcome-projection"

function makeStore(): CustomerOutcomeProjectionStorePort & {
  rows: CustomerOutcomeProjectionRecord[]
} {
  const rows: CustomerOutcomeProjectionRecord[] = []
  return {
    rows,
    findByExternalOutcomeId: async (id) =>
      rows.find((row) => row.externalOutcomeId === id) ?? null,
    findByExternalRecordId: async (id) =>
      rows.find((row) => row.externalRecordId === id) ?? null,
    create: async (data) => {
      const row = { ...data, id: data.id ?? `outcome_${rows.length + 1}` }
      rows.push(row)
      return row
    },
    update: async (id, data) => {
      const index = rows.findIndex((row) => row.id === id)
      rows[index] = { ...rows[index], ...data }
      return rows[index]
    },
  }
}

function fieldPayload(names: readonly string[]) {
  return JSON.stringify({
    data: {
      items: names.map((field_name) => ({ field_name, type: "text" })),
    },
  })
}

describe("customer outcome Feishu projection sync", () => {
  it("先核对字段再只读拉取，不写飞书", async () => {
    const runner = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes("+field-list")) {
        return { stdout: fieldPayload(CUSTOMER_OUTCOME_FIELD_NAMES), stderr: "" }
      }
      if (args.includes("+record-list")) {
        return {
          stdout: JSON.stringify({ data: { items: [] } }),
          stderr: "",
        }
      }
      throw new Error("unexpected")
    })
    await loadCustomerOutcomeSource({
      config: {
        baseToken: "base_1",
        tableId: "table_1",
        cliPath: "/mock/lark",
      },
      runner,
    })
    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls.flatMap((call) => call[1])).not.toContain("+record-upsert")
  })

  it("审核通过且证据齐全时写入 AIM 只读投影", async () => {
    const target = makeStore()
    const result = await syncCustomerOutcomeProjections({
      tableId: "table_1",
      snapshot: {
        fields: CUSTOMER_OUTCOME_FIELD_NAMES.map((name) => ({
          name,
          type: "text",
          writable: true,
        })),
        records: [{
          recordId: "rec_1",
          fields: {
            客户结果记录ID: "outcome_1",
            项目ID: "project_1",
            成交记录ID: "deal_1",
            指标编码: "revenue_30d",
            基线: 10,
            目标: 20,
            实际: 28,
            单位: "万",
            观察开始: "2026-07-01T00:00:00Z",
            观察结束: "2026-07-28T00:00:00Z",
            证据引用: "https://evidence.example/1",
            审核状态: "已通过",
            审核人: [{ id: "ou_owner" }],
            审核时间: "2026-07-29T00:00:00Z",
          },
        }],
      },
      db: {
        clientProject: {
          findMany: async () => [{ id: "project_1" }],
        },
      },
      store: target,
    })
    expect(result).toEqual(expect.objectContaining({
      created: 1,
      skipped: 0,
    }))
    expect(target.rows[0]).toEqual(expect.objectContaining({
      reviewStatus: "approved",
      reviewerRef: "ou_owner",
      externalRecordId: "rec_1",
    }))
  })

  it("伪 approved 但缺证据时跳过，不生成成功投影", async () => {
    const result = await syncCustomerOutcomeProjections({
      tableId: "table_1",
      snapshot: {
        fields: [],
        records: [{
          recordId: "rec_bad",
          fields: {
            客户结果记录ID: "outcome_bad",
            项目ID: "project_1",
            指标编码: "metric",
            观察开始: "2026-07-01T00:00:00Z",
            观察结束: "2026-07-28T00:00:00Z",
            审核状态: "approved",
          },
        }],
      },
      db: {
        clientProject: { findMany: async () => [{ id: "project_1" }] },
      },
      store: makeStore(),
    })
    expect(result.skipped).toBe(1)
    expect(result.errors[0]?.code).toBe("approved_without_evidence")
  })

  it("命中 limit=500 边界时 fail closed", async () => {
    const runner = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes("+field-list")) {
        return { stdout: fieldPayload(CUSTOMER_OUTCOME_FIELD_NAMES), stderr: "" }
      }
      if (args.includes("+record-list")) {
        return {
          stdout: JSON.stringify({
            data: {
              items: Array.from({ length: 500 }, (_, index) => ({
                record_id: `rec_${index}`,
                fields: {},
              })),
            },
          }),
          stderr: "",
        }
      }
      throw new Error("unexpected")
    })
    await expect(loadCustomerOutcomeSource({
      config: {
        baseToken: "base_1",
        tableId: "table_1",
        cliPath: "/mock/lark",
      },
      runner,
    })).rejects.toThrow(/limit=500/)
  })
})
