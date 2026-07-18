import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

// 客户会议洞察入口（90 天计划 2.2）route 级测试。
// mock 工作流 / store / 落盘端口 / prisma，注入 process.env 模拟密钥与负责人配置。

const { runMeetingInsightWorkflow, createLarkWorkItemStore, readWorkItemStoreConfig,
  createAimGenerationInsightResultSink, findUniqueProject } = vi.hoisted(() => ({
  runMeetingInsightWorkflow: vi.fn(),
  createLarkWorkItemStore: vi.fn(() => ({ get: vi.fn(), update: vi.fn() })),
  readWorkItemStoreConfig: vi.fn(() => ({ baseToken: "bse_1", tableId: "tbl_1", cliPath: "/mock/lark-cli" })),
  createAimGenerationInsightResultSink: vi.fn(() => ({ save: vi.fn() })),
  findUniqueProject: vi.fn(),
}))

vi.mock("@/lib/aim/meeting-workflow", () => ({ runMeetingInsightWorkflow }))
vi.mock("@/lib/aim/work-item-store", () => ({ createLarkWorkItemStore, readWorkItemStoreConfig }))
vi.mock("@/lib/aim/meeting-insight-result-sink", () => ({
  createAimGenerationInsightResultSink,
  buildAimResultLink: (id: string, projectId: string) =>
    `/aim?generationId=${id}&projectId=${projectId}&stage=results`,
}))
vi.mock("@/lib/prisma", () => ({
  prisma: { clientProject: { findUnique: findUniqueProject } },
}))

import { POST } from "@/app/api/integrations/feishu/work-items/meeting-insight/route"

const SECRET = "test-work-item-secret-with-enough-length-32"
const OWNER = "user_owner_1"
const ORIGINAL_ENV = { ...process.env }

const VALID_BODY = {
  recordId: "rec_1",
  projectId: "proj_1",
  meetingTitle: "数字供暖项目启动会",
  customer: "葛老板",
  transcript: "葛老板做数字供暖，年营收1300万想冲3000万……",
}

function post(body: unknown, token: string): NextRequest {
  return new NextRequest("http://localhost/api/integrations/feishu/work-items/meeting-insight", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: token },
    body: typeof body === "string" ? body : JSON.stringify(body),
  })
}

async function call(body: unknown = VALID_BODY, token = `Bearer ${SECRET}`) {
  const res = await POST(post(body, token))
  return { status: res.status, body: (await res.json()) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  process.env.AIM_WORK_ITEM_API_SECRET = SECRET
  process.env.AIM_WORK_ITEM_OWNER_USER_ID = OWNER
  findUniqueProject.mockResolvedValue({ userId: OWNER })
})
afterEach(() => {
  delete process.env.AIM_WORK_ITEM_API_SECRET
  delete process.env.AIM_WORK_ITEM_OWNER_USER_ID
  Object.assign(process.env, ORIGINAL_ENV)
})

describe("鉴权与 fail-closed", () => {
  it("密钥未配置 → 503", async () => {
    delete process.env.AIM_WORK_ITEM_API_SECRET
    const { status } = await call()
    expect(status).toBe(503)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("密钥错误 → 401", async () => {
    const { status } = await call(VALID_BODY, "Bearer wrong")
    expect(status).toBe(401)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
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

describe("输入校验（400）", () => {
  it("坏 JSON → 400", async () => {
    const { status } = await call("{ not json")
    expect(status).toBe(400)
  })

  it.each([
    ["recordId", { ...VALID_BODY, recordId: "" }],
    ["projectId", { ...VALID_BODY, projectId: "" }],
    ["meetingTitle", { ...VALID_BODY, meetingTitle: " " }],
    ["customer", { ...VALID_BODY, customer: "" }],
    ["transcript", { ...VALID_BODY, transcript: "  " }],
  ] as const)("缺 %s → 400", async (_, body) => {
    const { status } = await call(body)
    expect(status).toBe(400)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })
})

describe("项目归属（403，零串线）", () => {
  it("项目不存在 → 403", async () => {
    findUniqueProject.mockResolvedValueOnce(null)
    const { status } = await call()
    expect(status).toBe(403)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })

  it("项目属于他人 → 403", async () => {
    findUniqueProject.mockResolvedValueOnce({ userId: "someone_else" })
    const { status } = await call()
    expect(status).toBe(403)
    expect(runMeetingInsightWorkflow).not.toHaveBeenCalled()
  })
})

describe("工作流执行", () => {
  it("成功 → 200，带结果ID与统一结果链接", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: false, recordId: "rec_1", aimResultId: "gen_1",
    })
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body).toMatchObject({
      ok: true,
      status: "待人工审核",
      aimResultId: "gen_1",
      resultLink: "/aim?generationId=gen_1&projectId=proj_1&stage=results",
    })
    expect(runMeetingInsightWorkflow).toHaveBeenCalledWith(
      {
        recordId: "rec_1",
        meetingTitle: VALID_BODY.meetingTitle,
        customer: VALID_BODY.customer,
        transcript: VALID_BODY.transcript,
        projectId: "proj_1",
      },
      expect.objectContaining({ store: expect.any(Object), resultSink: expect.any(Object) }),
    )
  })

  it("幂等命中 → 200，idempotent:true", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: true, status: "待人工审核", idempotent: true, recordId: "rec_1", aimResultId: "gen_1",
    })
    const { status, body } = await call()
    expect(status).toBe(200)
    expect(body).toMatchObject({ idempotent: true })
  })

  it("工作流失败 → 409，错误原样透传", async () => {
    runMeetingInsightWorkflow.mockResolvedValueOnce({
      ok: false, status: "失败", error: "会议洞察无效：既无目标也无交付任务。", recordId: "rec_1",
    })
    const { status, body } = await call()
    expect(status).toBe(409)
    expect(String(body.error)).toContain("会议洞察无效")
  })
})
