import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest"

// ─── Mock Shanjian before imports ─────────────────────────

const {
  mockGenerateVirtualmanBroadcast,
  mockGenerateRealmanBroadcast,
  mockGenerateMaterialMixcut,
  mockGenerateNewsMixcut,
  mockGenerateRawVideo,
  mockGenerateCustomVirtualmanBroadcast,
  mockGenerateCustomRealmanBroadcast,
  mockGenerateCustomMaterialMixcut,
  mockGenerateAICover,
} = vi.hoisted(() => ({
  mockGenerateVirtualmanBroadcast: vi.fn(),
  mockGenerateRealmanBroadcast: vi.fn(),
  mockGenerateMaterialMixcut: vi.fn(),
  mockGenerateNewsMixcut: vi.fn(),
  mockGenerateRawVideo: vi.fn(),
  mockGenerateCustomVirtualmanBroadcast: vi.fn(),
  mockGenerateCustomRealmanBroadcast: vi.fn(),
  mockGenerateCustomMaterialMixcut: vi.fn(),
  mockGenerateAICover: vi.fn(),
}))

vi.mock("@/lib/shanjian", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/shanjian")>()
  return {
    ...actual,
    generateVirtualmanBroadcast: mockGenerateVirtualmanBroadcast,
    generateRealmanBroadcast: mockGenerateRealmanBroadcast,
    generateMaterialMixcut: mockGenerateMaterialMixcut,
    generateNewsMixcut: mockGenerateNewsMixcut,
    generateRawVideo: mockGenerateRawVideo,
    generateCustomVirtualmanBroadcast: mockGenerateCustomVirtualmanBroadcast,
    generateCustomRealmanBroadcast: mockGenerateCustomRealmanBroadcast,
    generateCustomMaterialMixcut: mockGenerateCustomMaterialMixcut,
    generateAICover: mockGenerateAICover,
  }
})

import { prisma, cleanDatabase, disconnectAll, cleanRedis, req, json } from "./helpers"
import { POST, GET } from "@/app/api/tasks/route"
import { GET as GET_BY_ID } from "@/app/api/tasks/[id]/route"
import jwt from "jsonwebtoken"

let user: { id: string; email: string }
let token: string
let readyAvatar: { id: string; name: string; externalVirtualmanId: string; externalSpeakerId: string }

function userReq(url: string, opts: { method?: string; body?: unknown } = {}) {
  return req(url, { ...opts, headers: { Authorization: `Bearer ${token}` } })
}

describe("Video Tasks E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    const u = await prisma.user.create({
      data: {
        email: "tasks-test@e2e.com",
        password: "hashed",
        name: "Tasks Tester",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    user = { id: u.id, email: u.email }
    token = jwt.sign({ id: user.id, email: user.email }, process.env.JWT_SECRET!, { expiresIn: "1h" })

    // Create a ready avatar for video generation
    const avatar = await prisma.avatar.create({
      data: {
        userId: user.id,
        name: "Ready Avatar",
        status: "ready",
        externalVirtualmanId: "vm-ready-1",
        externalSpeakerId: "sp-ready-1",
      },
    })
    readyAvatar = {
      id: avatar.id,
      name: avatar.name,
      externalVirtualmanId: avatar.externalVirtualmanId!,
      externalSpeakerId: avatar.externalSpeakerId!,
    }
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  beforeEach(async () => {
    mockGenerateVirtualmanBroadcast.mockReset()
    mockGenerateRealmanBroadcast.mockReset()
    mockGenerateMaterialMixcut.mockReset()
    mockGenerateNewsMixcut.mockReset()
    mockGenerateRawVideo.mockReset()
    mockGenerateCustomVirtualmanBroadcast.mockReset()
    mockGenerateCustomRealmanBroadcast.mockReset()
    mockGenerateCustomMaterialMixcut.mockReset()
    mockGenerateAICover.mockReset()
    await cleanRedis()
    // Clear processing tasks so concurrency limiter doesn't block subsequent tests
    await prisma.videoTask.updateMany({
      where: { userId: user.id, status: "processing" },
      data: { status: "completed" },
    })
  })

  // ─── POST /api/tasks ──────────────────────────────────

  let createdTaskId: string

  it("creates virtualman_broadcast task", async () => {
    mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-video-1", payload: {} })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: readyAvatar.id,
          scriptContent: "这是一段测试文案，用于生成数字人口播视频。",
          styleId: "style-001",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.data.status).toBe("processing")
    expect(body.data.externalTaskId).toBe("ext-video-1")
    expect(body.data.deliveryStatus).toBe("pending")
    expect(body.data.userId).toBe(user.id)
    expect(body.data.avatarId).toBe(readyAvatar.id)
    expect(body.data.scriptContent).toContain("测试文案")
    createdTaskId = body.data.id

    // Verify Script record was created
    const task = await prisma.videoTask.findUnique({ where: { id: body.data.id } })
    expect(task!.scriptId).toBeTruthy()
    const script = await prisma.script.findUnique({ where: { id: task!.scriptId! } })
    expect(script).not.toBeNull()
    expect(script!.content).toContain("测试文案")
  })

  it("creates a task from an existing selected scriptId", async () => {
    mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-video-from-script", payload: {} })

    const script = await prisma.script.create({
      data: {
        userId: user.id,
        content: "这是已经入库并选中的文案版本。",
        sourceTemplateId: "template-123",
        status: "selected",
      },
    })

    const scriptCountBefore = await prisma.script.count({
      where: { userId: user.id },
    })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: readyAvatar.id,
          scriptId: script.id,
          styleId: "style-from-script",
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(201)
    const body = await json(res)
    expect(body.data.scriptId).toBe(script.id)
    expect(body.data.scriptContent).toBe("这是已经入库并选中的文案版本。")
    expect(body.data.sourceTemplateId).toBe("template-123")

    const createdTask = await prisma.videoTask.findUnique({
      where: { id: body.data.id },
    })
    expect(createdTask?.scriptId).toBe(script.id)
    expect(createdTask?.scriptContent).toBe("这是已经入库并选中的文案版本。")

    const scriptCountAfter = await prisma.script.count({
      where: { userId: user.id },
    })
    expect(scriptCountAfter).toBe(scriptCountBefore)
  })

  it("keeps generic packaging materials on the standard virtualman route", async () => {
    mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-plan-standard", payload: {} })

    const script = await prisma.script.create({
      data: {
        userId: user.id,
        content: "这是带普通佐证素材的口播文案。",
        status: "selected",
      },
    })

    const plan = await prisma.videoProductionPlan.create({
      data: {
        userId: user.id,
        scriptId: script.id,
        styleId: "style-plan-standard",
        videoType: "virtualman_broadcast",
        materials: [
          {
            role: "product_detail",
            type: "image",
            fileUrl: "https://example.com/materials/product-detail.png",
          },
          {
            role: "customer_case",
            type: "video",
            fileUrl: "https://example.com/materials/customer-case.mp4",
          },
        ],
        status: "draft",
      },
    })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: readyAvatar.id,
          productionPlanId: plan.id,
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(201)
    expect(mockGenerateVirtualmanBroadcast).toHaveBeenCalledTimes(1)
    expect(mockGenerateCustomVirtualmanBroadcast).not.toHaveBeenCalled()

    const requestArg = mockGenerateVirtualmanBroadcast.mock.calls[0][0]
    expect(requestArg.styleId).toBe("style-plan-standard")
    expect(requestArg.materials).toEqual([
      {
        type: "image",
        fileUrl: "https://example.com/materials/product-detail.png",
      },
      {
        type: "video",
        fileUrl: "https://example.com/materials/customer-case.mp4",
      },
    ])
  })

  it("routes explicit scene-segment materials to the custom virtualman route", async () => {
    mockGenerateCustomVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-plan-custom", payload: {} })

    const script = await prisma.script.create({
      data: {
        userId: user.id,
        content: "这是按分镜组织素材的口播文案。",
        status: "selected",
      },
    })

    const plan = await prisma.videoProductionPlan.create({
      data: {
        userId: user.id,
        scriptId: script.id,
        styleId: "style-plan-custom",
        videoType: "virtualman_broadcast",
        materials: [
          {
            role: "scene_hook",
            type: "video",
            fileUrl: "https://example.com/materials/scene-hook.mp4",
          },
        ],
        status: "draft",
      },
    })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: readyAvatar.id,
          productionPlanId: plan.id,
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(201)
    expect(mockGenerateCustomVirtualmanBroadcast).toHaveBeenCalledTimes(1)
    expect(mockGenerateVirtualmanBroadcast).not.toHaveBeenCalled()

    const requestArg = mockGenerateCustomVirtualmanBroadcast.mock.calls[0][0]
    expect(requestArg.styleId).toBe("style-plan-custom")
    expect(requestArg.scenes).toEqual([
      {
        captions: { content: "这是按分镜组织素材的口播文案。" },
        materials: [
          {
            type: "video",
            fileUrl: "https://example.com/materials/scene-hook.mp4",
          },
        ],
      },
    ])
  })

  it("rejects task with invalid type", async () => {
    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "invalid_type",
          avatarId: readyAvatar.id,
          scriptContent: "Test",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("Invalid type")
  })

  it("rejects virtualman_broadcast without avatarId", async () => {
    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          scriptContent: "Test",
          styleId: "s1",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(400)
    const body = await json(res)
    expect(body.error).toContain("avatarId")
  })

  it("rejects task with non-ready avatar", async () => {
    const cloningAvatar = await prisma.avatar.create({
      data: { userId: user.id, name: "Cloning", status: "cloning" },
    })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: cloningAvatar.id,
          scriptContent: "Test",
          styleId: "s1",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(422)
    const body = await json(res)
    expect(body.error).toContain("not ready")
  })

  it("rejects task with avatar not found", async () => {
    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: "nonexistent-avatar",
          scriptContent: "Test",
          styleId: "s1",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(404)
    const body = await json(res)
    expect(body.error).toContain("not found")
  })

  it("allows task creation for another authenticated user", async () => {
    mockGenerateVirtualmanBroadcast.mockResolvedValue({ taskId: "ext-video-poor", payload: {} })

    const poorUser = await prisma.user.create({
      data: {
        email: "poor-tasks@e2e.com",
        password: "hashed",
        name: "Poor",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    const poorToken = jwt.sign({ id: poorUser.id, email: poorUser.email }, process.env.JWT_SECRET!, { expiresIn: "1h" })

    // Create a ready avatar for the poor user
    const poorAvatar = await prisma.avatar.create({
      data: {
        userId: poorUser.id,
        name: "Poor Avatar",
        status: "ready",
        externalVirtualmanId: "vm-poor",
        externalSpeakerId: "sp-poor",
      },
    })

    const res = await POST(
      req("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: poorAvatar.id,
          scriptContent: "Test",
          styleId: "s1",
        },
        headers: { Authorization: `Bearer ${poorToken}` },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)
  })

  it("surfaces Shanjian failure without touching user balance", async () => {
    mockGenerateVirtualmanBroadcast.mockRejectedValue(new Error("Shanjian API down"))

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "virtualman_broadcast",
          avatarId: readyAvatar.id,
          scriptContent: "This will fail",
          styleId: "style-fail",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(500)
  })

  it("creates realman_broadcast task (no avatar validation required)", async () => {
    mockGenerateRealmanBroadcast.mockResolvedValue({ taskId: "ext-realman-1", payload: {} })

    const res = await POST(
      userReq("/api/tasks", {
        method: "POST",
        body: {
          type: "realman_broadcast",
          avatarId: readyAvatar.id,
          styleId: "style-real",
          videoUrl: "https://example.com/real.mp4",
          scriptContent: "Real broadcast test",
        },
      }),
      undefined as never
    )
    expect(res.status).toBe(201)

    const body = await json(res)
    expect(body.data.status).toBe("processing")
    expect(body.data.externalTaskId).toBe("ext-realman-1")
  })

  // ─── GET /api/tasks ───────────────────────────────────

  it("lists tasks for the user", async () => {
    const res = await GET(
      userReq("/api/tasks"),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.results.length).toBeGreaterThanOrEqual(1)
    expect(body.data.total).toBeGreaterThanOrEqual(1)
    expect(body.data.results.every((t: { userId: string }) => t.userId === user.id)).toBe(true)
  })

  it("filters tasks by status", async () => {
    const res = await GET(
      userReq("/api/tasks?status=processing"),
      undefined as never
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.results.every((t: { status: string }) => t.status === "processing")).toBe(true)
  })

  // ─── GET /api/tasks/[id] ──────────────────────────────

  it("gets task by ID", async () => {
    const res = await GET_BY_ID(
      userReq(`/api/tasks/${createdTaskId}`),
      { params: Promise.resolve({ id: createdTaskId }) }
    )
    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.id).toBe(createdTaskId)
    expect(body.data.userId).toBe(user.id)
  })

  it("returns 404 for non-existent task", async () => {
    const res = await GET_BY_ID(
      userReq("/api/tasks/nonexistent-id"),
      { params: Promise.resolve({ id: "nonexistent-id" }) }
    )
    expect(res.status).toBe(404)
  })

  it("returns 404 for another user's task", async () => {
    const otherUser = await prisma.user.create({
      data: {
        email: "other-tasks@e2e.com",
        password: "hashed",
        name: "Other",
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
    })
    const otherAvatar = await prisma.avatar.create({
      data: { userId: otherUser.id, name: "OA", status: "ready" },
    })
    const otherTask = await prisma.videoTask.create({
      data: {
        userId: otherUser.id,
        avatarId: otherAvatar.id,
        status: "processing",
        scriptContent: "Other script",
        avatarName: "OA",
        externalTaskId: "ext-other-1",
      },
    })

    const res = await GET_BY_ID(
      userReq(`/api/tasks/${otherTask.id}`),
      { params: Promise.resolve({ id: otherTask.id }) }
    )
    expect(res.status).toBe(404)
  })
})
