import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// WP-8 无人值守执行入口（90 天计划 6.1）route 级集成测试。
// mock 飞书 store / 工作流 / 落盘端口，跑真实 dispatcher 与真实经营事项字段解析。

const {
  validateCronSecret,
  runMeetingInsightWorkflow,
  createLarkWorkItemStore,
  listPendingWorkItemRecords,
  readWorkItemStoreConfig,
  createAimGenerationInsightResultSink,
} = vi.hoisted(() => ({
  validateCronSecret: vi.fn(() => true),
  runMeetingInsightWorkflow: vi.fn(),
  createLarkWorkItemStore: vi.fn(),
  listPendingWorkItemRecords: vi.fn(),
  readWorkItemStoreConfig: vi.fn(() => ({ baseToken: "bse_1", tableId: "tbl_1", cliPath: "/mock/lark-cli" })),
  createAimGenerationInsightResultSink: vi.fn(() => ({ save: vi.fn() })),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret }))
vi.mock("@/lib/aim/work-item-store", () => ({ createLarkWorkItemStore, listPendingWorkItemRecords, readWorkItemStoreConfig }))
vi.mock("@/lib/aim/meeting-insight-result-sink", () => ({ createAimGenerationInsightResultSink }))
vi.mock("@/lib/aim/meeting-workflow", () => ({ runMeetingInsightWorkflow }))

import { GET } from "@/app/api/cron/feishu-work-items/dispatch/route"

const CRON_SECRET = "test-cron-secret-with-enough-length-32"
const OWNER = "user_owner_1"
const ORIGINAL_ENV = { ...process.env }

/** 构造一条「待处理」且字段齐备的会议经营事项记录。 */
function pendingRecord(recordId = "rec_1", overrides: Record<string, unknown> = {}) {
  return {
    recordId,
    fields: {
      状态: "待处理",
      AIM项目ID: "proj_1",
      输入内容: "葛老板做数字供暖，年营收1300万想冲3000万……",
      会议标题: "数字供暖项目启动会",
      客户名称: "葛老板",
      ...overrides,
    },
  }
}

/** 内存版 store：按 recordId 返回预置记录，update 仅记录调用。 */
function makeStore(records: Map<string, { recordId: string; fields: Record<string, unknown> }>) {
  return {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    update: vi.fn(async () => ({ ok: true as const })),
  }
}

function get(url: string, token = `Bearer ${CRON_SECRET}`): NextRequest {
  return new NextRequest(url, {
    method: "GET",
    headers: { authorization: token },
  })
}

async function call(token = `Bearer ${CRON_SECRET}`) {
  const res = await GET(get("http://localhost/api/cron/feishu-work-items/dispatch", token))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

let store: ReturnType<typeof makeStore>

beforeEach(() => {
  vi.clearAllMocks()
  process.env.CRON_SECRET = CRON_SECRET
  process.env.AIM_WORK_ITEM_OWNER_USER_ID = OWNER
  store = makeStore(new Map([["rec_1", pendingRecord()]]))
  createLarkWorkItemStore.mockReturnValue(store)
  listPendingWorkItemRecords.mockResolvedValue([pendingRecord()])
})

afterEach(() => {
  delete process.env.CRON_SECRET
  delete process.env.AIM_WORK_ITEM_OWNER_USER_ID
  Object.assign(process.env, ORIGINAL_ENV)
})

describe("鉴权与 fail-closed", () => {
  it("CRON_SECRET 未配置 → 401 fail-closed", async () => {
    delete process.env.CRON_SECRET
    validateCronSecret.mockReturnValueOnce(false)
    const { status } = await call()
    expect(status).toBe(401)
    expect(listPendingWorkItemRecords).not.toHaveBeenCalled()
  })

  it("密钥错误 → 401", async () => {
    validateCronSecret.mockReturnValueOnce(false)
    const { status } = await call("Bearer wrong")
    expect(status).toBe(401)
  })

  it("负责人配置缺失 → 503 fail-closed", async () => {
    delete process.env.AIM_WORK_ITEM_OWNER_USER_ID
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("OWNER_USER_ID")
  })

  it("飞书配置缺失 → 503 fail-closed", async () => {
    readWorkItemStoreConfig.mockImplementationOnce(() => {
      throw new Error("经营事项入口缺少 LARK_BASE_TOKEN 配置。")
    })
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("LARK_BASE_TOKEN")
  })
})

describe("无人值守调度执行", () => {
  it("待处理记录经真实 dispatcher 推进会议洞察工作流 → 成功计数 +1", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: false, recordId: "rec_1", aimResultId: "gen_1",
    })
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body.ok).toBe(true)
    const summary = body.summary as Record<string, unknown>
    expect(summary.scanned).toBe(1)
    expect(summary.succeeded).toBe(1)
    expect(summary.started).toBe(1)
    // 真实 dispatcher 调用了 execute → 真实解析出会议字段传入工作流。
    expect(runMeetingInsightWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({
        recordId: "rec_1",
        meetingTitle: "数字供暖项目启动会",
        customer: "葛老板",
        transcript: "葛老板做数字供暖，年营收1300万想冲3000万……",
        projectId: "proj_1",
      }),
      expect.objectContaining({ store: expect.any(Object), resultSink: expect.any(Object) }),
    )
  })

  it("会议原文为空 → execute 失败，记录进入失败/重试计数", async () => {
    store = makeStore(
      new Map([["rec_2", pendingRecord("rec_2", { 输入内容: "  " })] ]),
    )
    createLarkWorkItemStore.mockReturnValue(store)
    listPendingWorkItemRecords.mockResolvedValue([pendingRecord("rec_2", { 输入内容: "  " })])

    const { status, body } = await call()
    expect(status).toBe(200)
    const summary = body.summary as Record<string, unknown>
    expect(summary.scanned).toBe(1)
    expect(summary.succeeded).toBe(0)
    expect((summary.failed as number) + (summary.escalated as number)).toBeGreaterThanOrEqual(1)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("会议标题/客户缺失 → execute 拒绝，不消耗模型", async () => {
    store = makeStore(
      new Map([["rec_3", pendingRecord("rec_3", { 会议标题: "", 客户名称: "" })] ]),
    )
    createLarkWorkItemStore.mockReturnValue(store)
    listPendingWorkItemRecords.mockResolvedValue([pendingRecord("rec_3", { 会议标题: "", 客户名称: "" })])

    const { status, body } = await call()
    expect(status).toBe(200)
    const summary = body.summary as Record<string, unknown>
    expect(summary.succeeded).toBe(0)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("无待处理记录 → scanned=0，不触发任何执行", async () => {
    listPendingWorkItemRecords.mockResolvedValue([])
    const { status, body } = await call()
    expect(status).toBe(200)
    const summary = body.summary as Record<string, unknown>
    expect(summary.scanned).toBe(0)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("调度内部飞书故障（listPending 抛错）→ 受控 503，不暴露 500", async () => {
    listPendingWorkItemRecords.mockRejectedValueOnce(new Error("lark-cli 调用超时"))
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("无人值守调度执行失败")
    expect(String(body.error)).toContain("lark-cli 调用超时")
  })
})
