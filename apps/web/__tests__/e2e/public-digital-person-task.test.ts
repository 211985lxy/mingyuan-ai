import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"

// ─── 蝉镜在导入前 mock：断言订单参数，不发真实网络请求 ─────────
const { mockCreateDigitalHumanVideo } = vi.hoisted(() => {
  process.env.CHANJING_APP_ID = "e2e-public-dp-app"
  process.env.CHANJING_SECRET_KEY = "e2e-public-dp-secret"
  process.env.CHANJING_AUTH_TEXT = "E2E蝉镜授权文案"
  process.env.CHANJING_MAX_CONCURRENT = "10"
  process.env.DIGITAL_HUMAN_PROVIDER = "chanjing"
  return { mockCreateDigitalHumanVideo: vi.fn() }
})

vi.mock("@/lib/chanjing", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/chanjing")>()
  return { ...actual, createDigitalHumanVideo: mockCreateDigitalHumanVideo }
})

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers"
import { POST } from "@/app/api/tasks/route"
import { releaseProviderSlot } from "@/lib/digital-human-semaphore"
import jwt from "jsonwebtoken"

let user: { id: string; email: string }
let token: string
let projectId: string

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

/** 公共数字人下单载荷：不带 avatarId，直接给供应商的形象与音色 id。 */
function publicBody(overrides: Record<string, unknown> = {}) {
  return {
    type: "virtualman_broadcast",
    projectId,
    virtualmanId: "dp-public-1",
    speakerId: "voice-public-1",
    avatarName: "海城-商务",
    scriptContent: "这是一段使用公共数字人生成的口播测试文案。",
    ...overrides,
  }
}

describe("公共数字人下单（不走克隆，无需授权文案）", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const u = await prisma.user.create({
      data: {
        email: "public-dp@e2e.com",
        password: "hashed",
        name: "Public DP Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    user = { id: u.id, email: u.email }
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" })
    const project = await prisma.clientProject.create({ data: { userId: user.id, name: "公共数字人项目" } })
    projectId = project.id
  })

  afterAll(async () => {
    delete process.env.CHANJING_APP_ID
    delete process.env.CHANJING_SECRET_KEY
    delete process.env.CHANJING_AUTH_TEXT
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(async () => {
    mockCreateDigitalHumanVideo.mockReset()
    // 每次下单返回**唯一**的供应商任务号：返回固定值会让第二个任务落库时
    // 撞 VideoTask.externalTaskId 唯一约束（夹具问题，非产品缺陷）
    let seq = 0
    mockCreateDigitalHumanVideo.mockImplementation(async () => ({
      taskId: `cj-public-${(seq += 1)}`,
      payload: {},
    }))
    await cleanRedis()
    await prisma.videoTask.deleteMany()
  })

  it("用 virtualmanId+speakerId 提交即视为公共数字人，无需资产库记录", async () => {
    const res = await POST(userReq("/api/tasks", { method: "POST", body: publicBody() }), undefined as never)

    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body.data.status).toBe("processing")
    expect(body.data.externalTaskId).toBe("cj-public-1")
    // 未落 Avatar 记录，avatarId 为空、avatarName 记录展示名
    expect(body.data.avatarId).toBeNull()
    expect(body.data.avatarName).toBe("海城-商务")

    // 供应商实际收到的就是公共形象与音色 id
    expect(mockCreateDigitalHumanVideo).toHaveBeenCalledWith(
      expect.objectContaining({
        personId: "dp-public-1",
        audioManId: "voice-public-1",
        text: "这是一段使用公共数字人生成的口播测试文案。",
      }),
    )

    const task = await prisma.videoTask.findFirst({ where: { userId: user.id } })
    expect(task?.avatarId).toBeNull()
    expect(task?.provider).toBe("chanjing")
  })

  it("缺少 speakerId 时拒绝：公共数字人必须同时给出形象与音色", async () => {
    const res = await POST(
      userReq("/api/tasks", { method: "POST", body: publicBody({ speakerId: undefined }) }),
      undefined as never,
    )
    expect(res.status).toBe(400)
    expect(mockCreateDigitalHumanVideo).not.toHaveBeenCalled()
  })

  it("同一公共形象与文案重复提交命中幂等，不重复下单", async () => {
    const first = await POST(userReq("/api/tasks", { method: "POST", body: publicBody() }), undefined as never)
    const second = await POST(userReq("/api/tasks", { method: "POST", body: publicBody() }), undefined as never)

    expect(first.status).toBe(201)
    expect(second.status).toBeLessThan(300)
    const firstId = (await json(first)).data.id
    const secondBody = await json(second)
    expect(secondBody.data, `第二次提交应成功，实际响应：${JSON.stringify(secondBody)}`).toBeDefined()
    const secondId = secondBody.data.id
    expect(secondId).toBe(firstId)
    expect(mockCreateDigitalHumanVideo).toHaveBeenCalledTimes(1)
  })

  it("切换公共形象即视为不同订单", async () => {
    const first = await POST(userReq("/api/tasks", { method: "POST", body: publicBody() }), undefined as never)
    const firstId = (await json(first)).data.id
    // 首个任务会占用供应商并发槽，且无 webhook 释放（生产由回调/校准回收）
    await releaseProviderSlot("chanjing")

    const second = await POST(
      userReq("/api/tasks", { method: "POST", body: publicBody({ virtualmanId: "dp-public-2" }) }),
      undefined as never,
    )
    const secondId = (await json(second)).data.id

    // 意图断言：不同公共形象必须产生不同任务，而非命中上一条
    expect(secondId).not.toBe(firstId)
    expect(second.status).toBe(201)
    expect(mockCreateDigitalHumanVideo).toHaveBeenCalledTimes(2)
  })
})
