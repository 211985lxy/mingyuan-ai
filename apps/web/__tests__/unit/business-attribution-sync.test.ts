import { describe, expect, it, vi } from "vitest"
import {
  loadBusinessAttributionSource,
  syncBusinessAttributions,
} from "@/lib/aim/business-attribution-sync"
import { BUSINESS_ATTRIBUTION_FIELD_NAMES } from "@/lib/aim/business-attribution-field-contract"
import type {
  OutcomeAttributionRecord,
  OutcomeAttributionStorePort,
} from "@/lib/aim/outcome-attribution"

function makeStore(): OutcomeAttributionStorePort & { rows: OutcomeAttributionRecord[] } {
  const rows: OutcomeAttributionRecord[] = []
  return {
    rows,
    findByExternalRecordId: async (id) =>
      rows.find((row) => row.externalRecordId === id) ?? null,
    findByExternalLeadId: async (id) =>
      rows.find((row) => row.externalLeadId === id) ?? null,
    findByExternalDealId: async (id) =>
      rows.find((row) => row.externalDealId === id) ?? null,
    findByExternalPaymentId: async (id) =>
      rows.find((row) => row.externalPaymentId === id) ?? null,
    create: async (data) => {
      const row = { ...data, id: data.id ?? `attr_${rows.length + 1}` }
      rows.push(row)
      return row
    },
    update: async (id, data) => {
      const index = rows.findIndex((row) => row.id === id)
      if (index < 0) throw new Error("missing")
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

describe("business attribution Feishu read-only sync", () => {
  it("先核对真实字段，再只读拉取记录", async () => {
    const runner = vi.fn(async (_file: string, args: string[]) => {
      if (args.includes("+field-list")) {
        return { stdout: fieldPayload(BUSINESS_ATTRIBUTION_FIELD_NAMES), stderr: "" }
      }
      if (args.includes("+record-list")) {
        return {
          stdout: JSON.stringify({
            data: {
              items: [{
                record_id: "rec_1",
                created_time: "1785283200000",
                fields: {
                  AIM生成ID: "gen_1",
                  来源内容ID: "content_1",
                  线索记录ID: "lead_1",
                  预约记录ID: "appointment_1",
                  成交记录ID: "deal_1",
                  回款记录ID: "payment_1",
                  归因方式: "明确归因",
                  归因确认人: [{ id: "ou_owner" }],
                },
              }],
            },
          }),
          stderr: "",
        }
      }
      throw new Error("unexpected command")
    })
    const snapshot = await loadBusinessAttributionSource({
      config: {
        baseToken: "base_test",
        tableId: "table_test",
        cliPath: "/mock/lark",
      },
      runner,
    })
    expect(snapshot.records).toHaveLength(1)
    expect(runner).toHaveBeenCalledTimes(2)
    expect(runner.mock.calls.flatMap((call) => call[1])).not.toContain("+record-upsert")
  })

  it("生成存在时写入逐笔链，缺 generation 时保留 skipped 证据", async () => {
    const store = makeStore()
    const result = await syncBusinessAttributions({
      tableId: "table_1",
      snapshot: {
        fields: BUSINESS_ATTRIBUTION_FIELD_NAMES.map((name) => ({
          name,
          type: "text",
          writable: true,
        })),
        records: [
          {
            recordId: "rec_1",
            createdAt: new Date("2026-07-29T00:00:00Z"),
            fields: {
              AIM生成ID: "gen_1",
              来源内容ID: "content_1",
              线索记录ID: "lead_1",
              预约记录ID: "appointment_1",
              成交记录ID: "deal_1",
              回款记录ID: "payment_1",
              归因方式: "明确归因",
              归因确认人: "owner_1",
            },
          },
          {
            recordId: "rec_missing",
            createdAt: new Date("2026-07-29T00:00:00Z"),
            fields: { AIM生成ID: "gen_missing", 线索记录ID: "lead_2" },
          },
        ],
      },
      db: {
        aimGeneration: {
          findMany: async () => [{ id: "gen_1", userId: "user_1" }],
        },
      },
      store,
    })
    expect(result).toEqual(expect.objectContaining({
      sourceRecords: 2,
      created: 1,
      skipped: 1,
      conflicts: 0,
    }))
    expect(store.rows[0]).toEqual(expect.objectContaining({
      generationId: "gen_1",
      externalLeadId: "lead_1",
      externalAppointmentId: "appointment_1",
      externalDealId: "deal_1",
      externalPaymentId: "payment_1",
      attributionMethod: "explicit",
      attributionConfidence: "high",
      externalRecordId: "rec_1",
    }))
  })

  it("字段漂移时 fail closed，不读取经营记录", async () => {
    const runner = vi.fn(async () => ({
      stdout: fieldPayload(BUSINESS_ATTRIBUTION_FIELD_NAMES.filter(
        (name) => name !== "归因确认人",
      )),
      stderr: "",
    }))
    await expect(loadBusinessAttributionSource({
      config: {
        baseToken: "base_test",
        tableId: "table_test",
        cliPath: "/mock/lark",
      },
      runner,
    })).rejects.toThrow("缺少 归因确认人")
    expect(runner).toHaveBeenCalledTimes(1)
  })
})
