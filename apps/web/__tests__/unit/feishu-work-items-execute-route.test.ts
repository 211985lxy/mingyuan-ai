import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// WP-4 单条经营事项执行入口。
// route 级测试：mock WP-3 执行服务与 store 工厂，注入 process.env 模拟密钥/飞书配置。
// 对照 docs/plans/aim-ai-native-company-zcode-execution-plan.md §14 验收。

const { startWorkItem, submitWorkItemForReview, completeWorkItem, failWorkItem,
  createLarkWorkItemStore, readWorkItemStoreConfig } = vi.hoisted(() => ({
  startWorkItem: vi.fn(),
  submitWorkItemForReview: vi.fn(),
  completeWorkItem: vi.fn(),
  failWorkItem: vi.fn(),
  createLarkWorkItemStore: vi.fn(() => ({ get: vi.fn(), update: vi.fn() })),
  readWorkItemStoreConfig: vi.fn(() => ({ baseToken: "bse_1", tableId: "tbl_1", cliPath: "/mock/lark-cli" })),
}))

vi.mock("@/lib/aim/services/work-item-execution", () => ({
  startWorkItem,
  submitWorkItemForReview,
  completeWorkItem,
  failWorkItem,
}))

vi.mock("@/lib/aim/work-item-store", () => ({
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
}))

import { POST } from "@/app/api/integrations/feishu/work-items/execute/route"

const SECRET = "test-work-item-secret-with-enough-length-32"
const ORIGINAL_ENV = { ...process.env }

function post(body: unknown, token: string): NextRequest {
  return new NextRequest("http://localhost/api/integrations/feishu/work-items/execute", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function call(body: unknown, token = `Bearer ${SECRET}`) {
  const res = await POST(post(body, token))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AIM_WORK_ITEM_API_SECRET = SECRET
})
afterEach(() => {
  // 还原 env，避免泄漏到其它测试。
  for (const k of ["AIM_WORK_ITEM_API_SECRET"]) delete process.env[k]
  Object.assign(process.env, ORIGINAL_ENV)
})

describe("鉴权与 fail-closed", () => {
  it("密钥未配置 → 503 fail-closed", async () => {
    delete process.env.AIM_WORK_ITEM_API_SECRET
    const { status, body } = await call({ recordId: "rec_1", action: "start" })
    expect(status).toBe(503)
    expect(body.error).toMatch(/密钥|配置/i)
    expect(startWorkItem).not.toHaveBeenCalled()
  })

  it("缺 Bearer / 错误密钥 → 401，不执行服务", async () => {
    const { status } = await call({ recordId: "rec_1", action: "start" }, "Bearer wrong-secret")
    expect(status).toBe(401)
    expect(startWorkItem).not.toHaveBeenCalled()
  })

  it("无 authorization 头 → 401", async () => {
    const { status } = await call({ recordId: "rec_1", action: "start" }, "")
    expect(status).toBe(401)
  })

  it("正确密钥通过鉴权", async () => {
    startWorkItem.mockResolvedValueOnce({ ok: true, status: "处理中", idempotent: false, recordId: "rec_1" })
    const { status } = await call({ recordId: "rec_1", action: "start" })
    expect(status).toBe(200)
  })

  it("飞书配置缺失 → 503 fail-closed，不执行服务", async () => {
    readWorkItemStoreConfig.mockImplementationOnce(() => {
      throw new Error("经营事项入口缺少 LARK_BASE_TOKEN 配置。")
    })
    const { status, body } = await call({ recordId: "rec_1", action: "start" })
    expect(status).toBe(503)
    expect(String(body.error)).toContain("LARK_BASE_TOKEN")
    expect(startWorkItem).not.toHaveBeenCalled()
  })
})

describe("输入校验（400）", () => {
  it("坏 JSON → 400", async () => {
    const { status, body } = await call("{ not json")
    expect(status).toBe(400)
    expect(String(body.error)).toMatch(/JSON/i)
  })

  it("缺 recordId → 400", async () => {
    const { status } = await call({ action: "start" })
    expect(status).toBe(400)
  })

  it("非法 action → 400", async () => {
    const { status } = await call({ recordId: "rec_1", action: "magic" })
    expect(status).toBe(400)
  })

  it("submit_review 缺 aimResultId → 400", async () => {
    const { status } = await call({ recordId: "rec_1", action: "submit_review", resultSummary: "x" })
    expect(status).toBe(400)
  })

  it("fail 缺 errorMessage → 400", async () => {
    expect((await call({ recordId: "rec_1", action: "fail" })).status).toBe(400)
  })

  it("集成密钥 complete → 403 fail closed（WP-2）", async () => {
    const { status, body } = await call({
      recordId: "rec_1",
      action: "complete",
      aimResultId: "gen_1",
    })
    expect(status).toBe(403)
    expect(String(body.error)).toMatch(/approvalId|submit_review|集成密钥/)
    expect(completeWorkItem).not.toHaveBeenCalled()
  })
})

describe("三种允许 action 分发到 WP-3 服务", () => {
  it("start → startWorkItem", async () => {
    startWorkItem.mockResolvedValueOnce({ ok: true, status: "处理中", idempotent: false, recordId: "rec_1" })
    await call({ recordId: "rec_1", action: "start" })
    expect(startWorkItem).toHaveBeenCalledWith(expect.any(Object), "rec_1")
  })

  it("submit_review → submitWorkItemForReview（带结果字段）", async () => {
    submitWorkItemForReview.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: false, recordId: "rec_1",
    })
    await call({
      recordId: "rec_1", action: "submit_review",
      aimResultId: "gen_1", resultSummary: "诊断完成", resultLink: "https://aim/1",
    })
    expect(submitWorkItemForReview).toHaveBeenCalledWith(
      expect.any(Object), "rec_1",
      expect.objectContaining({ aimResultId: "gen_1", resultLink: "https://aim/1" }),
    )
  })

  it("fail → failWorkItem", async () => {
    failWorkItem.mockResolvedValueOnce({ ok: true, status: "失败", idempotent: false, recordId: "rec_1" })
    await call({ recordId: "rec_1", action: "fail", errorMessage: "生成超时" })
    expect(failWorkItem).toHaveBeenCalledWith(expect.any(Object), "rec_1", { errorMessage: "生成超时" })
  })
})

describe("幂等与错误不丢失", () => {
  it("幂等命中 → 200，idempotent:true", async () => {
    startWorkItem.mockResolvedValueOnce({ ok: true, status: "处理中", idempotent: true, recordId: "rec_1" })
    const { status, body } = await call({ recordId: "rec_1", action: "start" })
    expect(status).toBe(200)
    expect(body).toMatchObject({ idempotent: true })
  })

  it("业务冲突（ok:false）→ 409，error 原样透传，不被吞掉", async () => {
    startWorkItem.mockResolvedValueOnce({ ok: false, error: "经营事项状态非法跳转：已完成 → 处理中。" })
    const { status, body } = await call({ recordId: "rec_1", action: "start" })
    expect(status).toBe(409)
    expect(body.error).toContain("非法跳转")
  })

  it("记录不存在 → 409，error 带 recordId", async () => {
    startWorkItem.mockResolvedValueOnce({ ok: false, error: "经营事项记录不存在：rec_missing。" })
    const { status, body } = await call({ recordId: "rec_missing", action: "start" })
    expect(status).toBe(409)
    expect(body.error).toContain("rec_missing")
  })
})
