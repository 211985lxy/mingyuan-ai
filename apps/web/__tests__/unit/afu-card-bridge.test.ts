import { describe, expect, it } from "vitest"
import { upsertAfuCardWorkItem, type AfuCardWorkItemPorts, type AfuCardWorkItemRecord } from "@/lib/aim/afu-card-bridge"

function ports(initial: AfuCardWorkItemRecord[] = []) {
  const records = [...initial]
  const calls = { creates: 0, updates: [] as Array<{ id: string; fields: Record<string, unknown> }> }
  const value: AfuCardWorkItemPorts = {
    async list() { return records },
    async create(fields) { calls.creates += 1; const record = { recordId: `rec_${calls.creates}`, fields }; records.push(record); return record },
    async update(recordId, fields) { calls.updates.push({ id: recordId, fields }); const record = records.find((item) => item.recordId === recordId); if (record) record.fields = { ...record.fields, ...fields } },
  }
  return { value, calls, records }
}

const input = { topicId: "topic_1", title: "写一条内容", workflow: "内容增长" as const, aimProjectId: "project_1", inputSummary: "围绕客户痛点", scheduledStart: "2026-07-20 10:00:00" }

describe("Afu card bridge", () => {
  it("创建待处理事项并保留稳定卡片 ID", async () => {
    const p = ports()
    const result = await upsertAfuCardWorkItem(input, p.value)
    expect(result).toMatchObject({ ok: true, created: true, recordId: "rec_1" })
    expect(p.records[0].fields).toMatchObject({ Markdown卡片ID: "topic_1", 状态: "待处理", 工作流: "内容增长", AIM项目ID: "project_1" })
  })

  it("重复投影幂等，不重复写入", async () => {
    const p = ports()
    await upsertAfuCardWorkItem(input, p.value)
    const result = await upsertAfuCardWorkItem(input, p.value)
    expect(result).toMatchObject({ ok: true, idempotent: true, recordId: "rec_1" })
    expect(p.calls.creates).toBe(1)
    expect(p.calls.updates).toHaveLength(0)
  })

  it("只更新 Markdown 所有字段，不覆盖 Base 状态和结果", async () => {
    const p = ports([{ recordId: "rec_existing", fields: { Markdown卡片ID: "topic_1", 工作流: "内容增长", AIM项目ID: "project_1", 状态: "处理中", AIM结果ID: "result_1", 事项名称: "旧标题", 输入内容: "旧" } }])
    const result = await upsertAfuCardWorkItem({ ...input, title: "新标题", inputSummary: "新内容" }, p.value)
    expect(result).toMatchObject({ ok: true, idempotent: false, recordId: "rec_existing" })
    expect(p.calls.updates[0].fields).toMatchObject({ 事项名称: "新标题", 输入内容: "新内容" })
    expect(p.calls.updates[0].fields).not.toHaveProperty("状态")
    expect(p.records[0].fields).toMatchObject({ 状态: "处理中", AIM结果ID: "result_1" })
  })

  it("工作流或项目冲突时拒绝覆盖", async () => {
    const p = ports([{ recordId: "rec_existing", fields: { Markdown卡片ID: "topic_1", 工作流: "销售诊断", AIM项目ID: "project_1" } }])
    const result = await upsertAfuCardWorkItem(input, p.value)
    expect(result).toMatchObject({ ok: false })
    expect(p.calls.updates).toHaveLength(0)
  })
})
