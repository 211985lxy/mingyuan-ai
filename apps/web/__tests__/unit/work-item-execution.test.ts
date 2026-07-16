import { describe, expect, it } from "vitest"

import {
  completeWorkItem,
  failWorkItem,
  startWorkItem,
  submitWorkItemForReview,
  type WorkItemRecord,
  type WorkItemRecordStore,
} from "@/lib/aim/services/work-item-execution"

// WP-3 经营事项执行服务：在零真实飞书调用下完成单测。
// store 端口是注入的（get + update），不直连 lark-cli/lark-base-tool。
// 覆盖：开始（幂等）、提交审核、完成、失败、非法跳转、记录缺失、错误不丢失。

/** 用闭包记录调用历史，便于断言是否真写了回写。 */
function makeStore(record: WorkItemRecord | null): WorkItemRecordStore & {
  updates: { recordId: string; fields: Record<string, unknown> }[]
  setRecord(next: WorkItemRecord | null): void
} {
  let current = record
  const updates: { recordId: string; fields: Record<string, unknown> }[] = []
  return {
    updates,
    async get(recordId) {
      if (!current || current.recordId !== recordId) return null
      return current
    },
    async update(recordId, fields) {
      updates.push({ recordId, fields })
      // 写入后本地状态推进到新状态，便于连续操作断言。
      if (current && typeof fields["状态"] === "string") {
        current = { ...current, fields: { ...current.fields, 状态: fields["状态"] } }
      }
      return { ok: true as const }
    },
    setRecord(next) {
      current = next
    },
  }
}

function recordAt(status: string, extra: Record<string, unknown> = {}): WorkItemRecord {
  return { recordId: "rec_001", fields: { 状态: status, ...extra } }
}

describe("startWorkItem", () => {
  it("待处理 → 处理中，回写状态与最后处理时间", async () => {
    const store = makeStore(recordAt("待处理"))
    const result = await startWorkItem(store, "rec_001")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe("处理中")
      expect(result.idempotent).toBe(false)
      expect(result.recordId).toBe("rec_001")
    }
    expect(store.updates).toHaveLength(1)
    expect(store.updates[0].fields["状态"]).toBe("处理中")
    expect(typeof store.updates[0].fields["最后处理时间"]).toBe("number")
  })

  it("已是处理中时幂等，不重复回写", async () => {
    const store = makeStore(recordAt("处理中"))
    const result = await startWorkItem(store, "rec_001")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.idempotent).toBe(true)
      expect(result.status).toBe("处理中")
    }
    // 真幂等：不产生任何回写。
    expect(store.updates).toHaveLength(0)
  })

  it("拒绝从非待处理/非处理中状态开始（非法跳转不写失败 patch）", async () => {
    const store = makeStore(recordAt("已完成"))
    const result = await startWorkItem(store, "rec_001")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("已完成")
    }
    expect(store.updates).toHaveLength(0)
  })
})

describe("submitWorkItemForReview", () => {
  it("处理中 → 待人工审核，回写结果与结果链接", async () => {
    const store = makeStore(recordAt("处理中"))
    const result = await submitWorkItemForReview(store, "rec_001", {
      aimResultId: "gen_001",
      resultSummary: "诊断完成。",
      resultLink: "https://aim.example.com/run/1",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("待人工审核")
    expect(store.updates[0].fields["AIM结果ID"]).toBe("gen_001")
    expect(store.updates[0].fields["结果链接"]).toEqual({
      link: "https://aim.example.com/run/1",
      text: "查看 AIM 结果",
    })
  })

  it("缺少结果ID时拒绝提交（禁止伪造审核态）", async () => {
    const store = makeStore(recordAt("处理中"))
    const result = await submitWorkItemForReview(store, "rec_001", {
      aimResultId: "",
      resultSummary: "",
      resultLink: "",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("AIM结果ID")
    expect(store.updates).toHaveLength(0)
  })

  it("已处于待人工审核时幂等（需提供相同结果ID才不重写）", async () => {
    const store = makeStore(recordAt("待人工审核", {
      AIM结果ID: "gen_001",
      结果摘要: "诊断完成。",
    }))
    const result = await submitWorkItemForReview(store, "rec_001", {
      aimResultId: "gen_001",
      resultSummary: "诊断完成。",
      resultLink: "",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.idempotent).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it("已处于待人工审核但结果不同，不把不同请求误判为幂等", async () => {
    const store = makeStore(recordAt("待人工审核", {
      AIM结果ID: "gen_old",
      结果摘要: "旧结果。",
    }))
    const result = await submitWorkItemForReview(store, "rec_001", {
      aimResultId: "gen_new",
      resultSummary: "新结果。",
      resultLink: "",
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("不一致")
    expect(store.updates).toHaveLength(0)
  })
})

describe("completeWorkItem", () => {
  it("待人工审核 → 已完成，清空旧错误信息", async () => {
    const store = makeStore(recordAt("待人工审核", { 错误信息: "旧错误" }))
    const result = await completeWorkItem(store, "rec_001", {
      aimResultId: "gen_001",
      resultSummary: "交付完成。",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("已完成")
    expect(store.updates[0].fields["错误信息"]).toBe("")
    expect(store.updates[0].fields["AIM结果ID"]).toBe("gen_001")
  })

  it("已完成为终态，再次完成幂等不报错", async () => {
    const store = makeStore(recordAt("已完成", {
      AIM结果ID: "gen_001",
      结果摘要: "已交付。",
    }))
    const result = await completeWorkItem(store, "rec_001", {
      aimResultId: "gen_001",
      resultSummary: "已交付。",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.idempotent).toBe(true)
    expect(store.updates).toHaveLength(0)
  })

  it("已完成但结果不同，拒绝覆盖终态结果", async () => {
    const store = makeStore(recordAt("已完成", {
      AIM结果ID: "gen_old",
      结果摘要: "旧交付。",
    }))
    const result = await completeWorkItem(store, "rec_001", {
      aimResultId: "gen_new",
      resultSummary: "新交付。",
    })

    expect(result.ok).toBe(false)
    expect(store.updates).toHaveLength(0)
  })

  it("拒绝无结果ID的完成", async () => {
    const store = makeStore(recordAt("待人工审核"))
    const result = await completeWorkItem(store, "rec_001", {
      aimResultId: "",
      resultSummary: "",
    })

    expect(result.ok).toBe(false)
    expect(store.updates).toHaveLength(0)
  })
})

describe("failWorkItem", () => {
  it("处理中 → 失败，写入可行动错误且不伪造结果", async () => {
    const store = makeStore(recordAt("处理中"))
    const result = await failWorkItem(store, "rec_001", {
      errorMessage: "AIM 生成超时，无结果产出。",
    })

    expect(result.ok).toBe(true)
    if (result.ok) expect(result.status).toBe("失败")
    expect(store.updates[0].fields["错误信息"]).toBe("AIM 生成超时，无结果产出。")
    expect(store.updates[0].fields).not.toHaveProperty("AIM结果ID")
  })

  it("拒绝空错误信息", async () => {
    const store = makeStore(recordAt("处理中"))
    const result = await failWorkItem(store, "rec_001", { errorMessage: "" })

    expect(result.ok).toBe(false)
    expect(store.updates).toHaveLength(0)
  })

  it("已失败且错误相同视为幂等，错误不同则拒绝静默丢弃", async () => {
    const store = makeStore(recordAt("失败", { 错误信息: "生成超时" }))

    const same = await failWorkItem(store, "rec_001", { errorMessage: "生成超时" })
    const different = await failWorkItem(store, "rec_001", { errorMessage: "权限不足" })

    expect(same.ok).toBe(true)
    if (same.ok) expect(same.idempotent).toBe(true)
    expect(different.ok).toBe(false)
    expect(store.updates).toHaveLength(0)
  })
})

describe("记录缺失与错误不丢失", () => {
  it("记录不存在时返回 ok:false 且带可行动错误", async () => {
    const store = makeStore(null)
    const result = await startWorkItem(store, "rec_missing")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("rec_missing")
    expect(store.updates).toHaveLength(0)
  })

  it("端口 get 抛错时不被静默吞掉（错误不丢失）", async () => {
    const store: WorkItemRecordStore = {
      async get() {
        throw new Error("飞书 503")
      },
      async update() {
        return { ok: true as const }
      },
    }
    const result = await startWorkItem(store, "rec_001")

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error).toContain("飞书 503")
  })

  it("状态字段未知（非可执行业务状态）时拒绝执行", async () => {
    const store = makeStore({ recordId: "rec_001", fields: { 状态: "已归档" } })
    const result = await startWorkItem(store, "rec_001")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      // 错误信息里应能看出原始状态，便于在飞书侧定位。
      expect(result.error).toMatch(/已归档|状态/)
    }
  })
})
