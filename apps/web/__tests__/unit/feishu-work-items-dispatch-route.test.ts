import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// WP-8 无人值守执行入口（90 天计划 6.1）route 级集成测试。
// mock 飞书 store / 工作流 / 落盘端口，跑真实 dispatcher 与真实经营事项字段解析。

const {
  validateCronSecret,
  runMeetingInsightWorkflow,
  createLarkWorkItemStore,
  createShadowWorkItemStore,
  listPendingWorkItemRecords,
  readWorkItemStoreConfig,
  createAimGenerationInsightResultSink,
  claimAimTrace,
  failAimTrace,
  releaseAimTraceClaim,
  readSupervisorNotificationConfig,
  sendFeishuSupervisorNotification,
  readLoopRuntimeConfig,
  findProject,
} = vi.hoisted(() => ({
  validateCronSecret: vi.fn(() => true),
  runMeetingInsightWorkflow: vi.fn(),
  createLarkWorkItemStore: vi.fn(),
  createShadowWorkItemStore: vi.fn((store) => store),
  listPendingWorkItemRecords: vi.fn(),
  readWorkItemStoreConfig: vi.fn(() => ({ baseToken: "bse_1", tableId: "tbl_1", cliPath: "/mock/lark-cli" })),
  createAimGenerationInsightResultSink: vi.fn(() => ({ save: vi.fn() })),
  claimAimTrace: vi.fn(async (input: { id: string }): Promise<
    | { acquired: true; trace: { id: string; startedAt: number } }
    | { acquired: false; reason: "duplicate" }
  > => ({
    acquired: true as const,
    trace: { id: input.id, startedAt: Date.now() },
  })),
  failAimTrace: vi.fn(async () => undefined),
  releaseAimTraceClaim: vi.fn(async () => undefined),
  readSupervisorNotificationConfig: vi.fn(() => ({ enabled: false as const })),
  sendFeishuSupervisorNotification: vi.fn(async () => undefined),
  readLoopRuntimeConfig: vi.fn(() => ({
    enabled: true,
    shadowMode: false,
    operatingMode: "supervised_auto" as import("@/lib/aim/loops/contracts").LoopOperatingMode,
    pilotProjectIds: new Set(["proj_1"]),
  })),
  findProject: vi.fn(async () => ({ userId: "user_owner_1" })),
}))

vi.mock("@/lib/admin-auth", () => ({ validateCronSecret }))
vi.mock("@/lib/aim/work-item-store", () => ({
  createLarkWorkItemStore,
  createShadowWorkItemStore,
  listPendingWorkItemRecords,
  readWorkItemStoreConfig,
}))
vi.mock("@/lib/aim/meeting-insight-result-sink", () => ({ createAimGenerationInsightResultSink }))
vi.mock("@/lib/aim/meeting-workflow", () => ({ runMeetingInsightWorkflow }))
vi.mock("@/lib/aim-observability", () => ({ claimAimTrace, failAimTrace, releaseAimTraceClaim }))
vi.mock("@/lib/aim/feishu-supervisor-notifier", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/aim/feishu-supervisor-notifier")>(),
  readSupervisorNotificationConfig,
  sendFeishuSupervisorNotification,
}))
vi.mock("@/lib/aim/loop-runtime-config", () => ({ readLoopRuntimeConfig }))
vi.mock("@/lib/prisma", () => ({
  prisma: { clientProject: { findUnique: findProject } },
}))
vi.mock("@/env", () => ({
  env: new Proxy({}, { get: (_target, key) => process.env[String(key)] }),
}))

import { GET } from "@/app/api/cron/feishu-work-items/dispatch/route"
import { classifyDispatchRetry } from "@/lib/aim/work-item-dispatch-retry"
import { DISPATCH_FIELDS } from "@/lib/aim/work-item-dispatch"

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
      LoopID: "sales-diagnosis-v1",
      Loop版本: 1,
      ...overrides,
    },
  }
}

/** 内存版 store：按 recordId 返回预置记录，update 仅记录调用。 */
function makeStore(records: Map<string, { recordId: string; fields: Record<string, unknown> }>) {
  return {
    get: vi.fn(async (id: string) => records.get(id) ?? null),
    update: vi.fn(async (recordId: string, fields: Record<string, unknown>) => {
      const record = records.get(recordId)
      if (record) record.fields = { ...record.fields, ...fields }
      return { ok: true as const }
    }),
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

  it("总开关关闭时安全 no-op，不读取飞书或调用模型", async () => {
    readLoopRuntimeConfig.mockReturnValueOnce({
      enabled: false,
      shadowMode: true,
      operatingMode: "shadow",
      pilotProjectIds: new Set(),
    })
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body).toMatchObject({ ok: true, enabled: false, mode: "disabled" })
    expect(readWorkItemStoreConfig).not.toHaveBeenCalled()
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("灰度配置无试点项目 → 503 fail-closed", async () => {
    readLoopRuntimeConfig.mockImplementationOnce(() => {
      throw new Error("缺少试点项目")
    })
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("灰度配置不可用")
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
    expect(String(body.error)).toContain("配置不可用")
    expect(String(body.error)).not.toContain("LARK_BASE_TOKEN")
  })

  it("监督通知启用但配置不完整 → 503 fail-closed", async () => {
    readSupervisorNotificationConfig.mockImplementationOnce(() => {
      throw new Error("缺少 AIM_SUPERVISOR_CHAT_ID")
    })
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("监督通知配置不可用")
    expect(listPendingWorkItemRecords).not.toHaveBeenCalled()
  })
})

describe("临时错误白名单", () => {
  it.each(["上游 408", "请求 timeout", "上游 429", "上游 503", "ECONNRESET", "网络异常"])(
    "%s 可重试",
    (error) => expect(classifyDispatchRetry(error).retryable).toBe(true),
  )
  it.each(["上游 400", "上游 401", "上游 402 余额不足", "上游 403", "模型 404 unavailable", "配置缺失"])(
    "%s 不可重试",
    (error) => expect(classifyDispatchRetry(error).retryable).toBe(false),
  )
})

describe("无人值守调度执行", () => {
  it("待处理记录经真实 dispatcher 推进会议洞察工作流 → 成功计数 +1", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: false, recordId: "rec_1", aimResultId: "gen_1",
      verificationStatus: "needs_human", resultLink: "https://example.com/gen_1",
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
        traceId: expect.stringMatching(/^loop_run_/),
      }),
      expect.objectContaining({ store: expect.any(Object), resultSink: expect.any(Object) }),
    )
    expect(sendFeishuSupervisorNotification).toHaveBeenCalledWith(expect.objectContaining({
      notification: expect.objectContaining({
        type: "human_judgment",
        resultLink: "https://example.com/gen_1",
      }),
    }))
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

  it("非试点项目被过滤，不领取 Trace 或调用模型", async () => {
    listPendingWorkItemRecords.mockResolvedValue([pendingRecord("rec_other", { AIM项目ID: "proj_other" })])
    const { body } = await call()
    expect((body.summary as Record<string, unknown>).scanned).toBe(0)
    expect(claimAimTrace).not.toHaveBeenCalled()
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("影子模式使用隔离 store 且不发送监督通知", async () => {
    readLoopRuntimeConfig.mockReturnValueOnce({
      enabled: true,
      shadowMode: true,
      operatingMode: "shadow",
      pilotProjectIds: new Set(["proj_1"]),
    })
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: false, recordId: "rec_1", aimResultId: "gen_shadow",
    })
    const { body } = await call()
    expect(body.mode).toBe("shadow")
    expect(createShadowWorkItemStore).toHaveBeenCalledWith(store)
    expect(sendFeishuSupervisorNotification).not.toHaveBeenCalled()
  })

  it("项目不属于配置负责人时不消耗模型", async () => {
    findProject.mockResolvedValueOnce({ userId: "another_owner" })
    const { body } = await call()
    expect((body.summary as Record<string, unknown>).escalated).toBe(1)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("调度内部飞书故障（listPending 抛错）→ 受控 503，不暴露 500", async () => {
    listPendingWorkItemRecords.mockRejectedValueOnce(new Error("lark-cli 调用超时"))
    const { status, body } = await call()
    expect(status).toBe(503)
    expect(String(body.error)).toContain("无人值守调度执行失败")
    expect(String(body.error)).not.toContain("lark-cli 调用超时")
  })

  it("销售诊断失败立即人工接管，公开摘要不泄露内部错误", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: false,
      status: "失败",
      recordId: "rec_1",
      error: "provider-secret-token=should-not-leak",
    })

    const { status, body } = await call()
    const serialized = JSON.stringify(body)
    const summary = body.summary as Record<string, unknown>

    expect(status).toBe(200)
    expect(summary.escalated).toBe(1)
    expect(serialized).not.toContain("provider-secret-token")
    expect(serialized).toContain("DISPATCH_ITEM_FAILED")
    expect(sendFeishuSupervisorNotification).toHaveBeenCalledWith(expect.objectContaining({
      notification: expect.objectContaining({
        type: "manual_takeover",
        summary: "自动执行失败，请打开经营事项或运行追踪查看详情。",
      }),
    }))
    expect(JSON.stringify(sendFeishuSupervisorNotification.mock.calls)).not.toContain("should-not-leak")
    expect(store.update.mock.calls.some(([, fields]) =>
      fields[DISPATCH_FIELDS.retryCount] === 1 || fields["状态"] === "待处理",
    )).toBe(false)
  })

  it("模型 503 虽属临时错误，但当前 Loop 零自动重试预算会立即转人工", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: false,
      status: "失败",
      recordId: "rec_1",
      error: "会议洞察模型调用失败：上游 503",
    })
    const { body } = await call()
    const summary = body.summary as Record<string, unknown>
    expect(summary.failed).toBe(0)
    expect(summary.escalated).toBe(1)
    expect(store.update.mock.calls.some(([, fields]) =>
      fields[DISPATCH_FIELDS.retryCount] === 1,
    )).toBe(false)
  })

  it("确定性验证失败不可重试，立即人工接管", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: false,
      status: "失败",
      recordId: "rec_1",
      error: "高风险事实无原文证据",
      stopReason: "verification_failed",
    })
    const { body } = await call()
    const summary = body.summary as Record<string, unknown>
    expect(summary.failed).toBe(0)
    expect(summary.escalated).toBe(1)
    expect(store.update.mock.calls.some(([, fields]) =>
      fields[DISPATCH_FIELDS.stopReason] === "verification_failed"
        && fields[DISPATCH_FIELDS.nextAction] === "人工接管处理",
    )).toBe(true)
  })

  it("缺 LoopID 时不进入销售诊断执行器", async () => {
    const record = pendingRecord("rec_1", { LoopID: "" })
    store = makeStore(new Map([["rec_1", record]]))
    createLarkWorkItemStore.mockReturnValue(store)
    listPendingWorkItemRecords.mockResolvedValue([record])
    const { body } = await call()
    const summary = body.summary as Record<string, unknown>
    expect(summary.escalated).toBe(1)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("Trace 重复领取只计抑制，不重试或回写失败状态", async () => {
    claimAimTrace.mockResolvedValueOnce({ acquired: false, reason: "duplicate" })
    const { body } = await call()
    const summary = body.summary as Record<string, unknown>
    expect(summary.duplicatesSuppressed).toBe(1)
    expect(summary.failed).toBe(0)
    expect(summary.escalated).toBe(0)
    expect(store.update).not.toHaveBeenCalled()
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })
})
