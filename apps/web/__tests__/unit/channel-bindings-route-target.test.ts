import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest, NextResponse } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateRequest: vi.fn(),
  findUnique: vi.fn(),
  findFirst: vi.fn(),
  upsert: vi.fn(),
}))

vi.mock("@/lib/user-auth", () => ({
  authenticateRequest: mocks.authenticateRequest,
  // 模拟真实 authErrorResponse：识别带 status 的错误（如 ApiRequestError），其余返回 null
  authErrorResponse: (error: unknown) => {
    if (error && typeof error === "object" && "status" in error && typeof (error as { status: unknown }).status === "number") {
      return NextResponse.json({ error: (error as Error).message }, { status: (error as { status: number }).status })
    }
    return null
  },
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    channelBinding: {
      findUnique: mocks.findUnique,
      upsert: mocks.upsert,
    },
    clientProject: {
      findFirst: mocks.findFirst,
    },
  },
}))

import { POST } from "@/app/api/account/channel-bindings/route"

function request(body: Record<string, unknown>) {
  return new NextRequest("http://localhost/api/account/channel-bindings", {
    method: "POST",
    headers: { "Content-Type": "application/json", origin: "http://localhost", "sec-fetch-site": "same-origin" },
    body: JSON.stringify(body),
  })
}

describe("channel-bindings routeTarget / defaultAgentId", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateRequest.mockResolvedValue({ id: "user-1" })
    mocks.findFirst.mockResolvedValue({ id: "proj-1" }) // project exists
    mocks.findUnique.mockResolvedValue(null) // no existing binding
    mocks.upsert.mockImplementation(async (args: { create: Record<string, unknown> }) => ({
      id: "binding-1",
      ...args.create,
      project: { id: "proj-1", name: "P", status: "active" },
    }))
  })

  it("默认 routeTarget=topic（选题采集）", async () => {
    const res = await POST(request({
      platform: "feishu",
      externalChatId: "oc_1",
      projectId: "proj-1",
    }))
    expect(res.status).toBe(201)
    const createArg = mocks.upsert.mock.calls[0][0].create
    expect(createArg.routeTarget).toBe("topic")
    expect(createArg.defaultAgentId).toBeUndefined()
  })

  it("接受 routeTarget=aim + defaultAgentId 并落库", async () => {
    const res = await POST(request({
      platform: "feishu",
      externalChatId: "oc_2",
      projectId: "proj-1",
      routeTarget: "aim",
      defaultAgentId: "deep_copywriter",
    }))
    expect(res.status).toBe(201)
    const createArg = mocks.upsert.mock.calls[0][0].create
    expect(createArg.routeTarget).toBe("aim")
    expect(createArg.defaultAgentId).toBe("deep_copywriter")
  })

  it("routeTarget=aim 时 defaultAgentId 可为空（要求消息带 /命令）", async () => {
    const res = await POST(request({
      platform: "feishu",
      externalChatId: "oc_3",
      projectId: "proj-1",
      routeTarget: "aim",
    }))
    expect(res.status).toBe(201)
    const createArg = mocks.upsert.mock.calls[0][0].create
    expect(createArg.routeTarget).toBe("aim")
  })

  it("非法的 defaultAgentId 被拒绝（422/400）", async () => {
    const res = await POST(request({
      platform: "feishu",
      externalChatId: "oc_4",
      projectId: "proj-1",
      routeTarget: "aim",
      defaultAgentId: "not_a_real_agent",
    }))
    expect(res.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })

  it("非法 routeTarget 被拒绝", async () => {
    const res = await POST(request({
      platform: "feishu",
      externalChatId: "oc_5",
      projectId: "proj-1",
      routeTarget: "email",
    }))
    expect(res.status).toBe(400)
    expect(mocks.upsert).not.toHaveBeenCalled()
  })
})
