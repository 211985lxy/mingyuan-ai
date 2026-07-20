import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({
  authenticateAgentRequest: vi.fn(),
  assertAgentProjectAccess: vi.fn(),
  recordAgentApiCall: vi.fn(),
  ingestInspirationEvent: vi.fn(),
}))

vi.mock("@/lib/agent-api-auth", () => ({
  authenticateAgentRequest: mocks.authenticateAgentRequest,
  assertAgentProjectAccess: mocks.assertAgentProjectAccess,
  recordAgentApiCall: mocks.recordAgentApiCall,
  agentAuthErrorResponse: () => null,
}))
vi.mock("@/features/topics/services/inspiration-events", () => ({ ingestInspirationEvent: mocks.ingestInspirationEvent }))

import { POST } from "@/app/api/agent/v1/inspiration/events/route"

describe("POST /api/agent/v1/inspiration/events", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.authenticateAgentRequest.mockResolvedValue({ apiKeyId: "key-1", userId: "user-1", allowedProjects: ["project-1"], allowedAgents: [] })
    mocks.assertAgentProjectAccess.mockResolvedValue(undefined)
    mocks.recordAgentApiCall.mockResolvedValue(undefined)
    mocks.ingestInspirationEvent.mockResolvedValue({ id: "inspiration-1", duplicate: false, status: "queued", processingStage: "queued", statusUrl: "/status", shadowMode: false })
  })

  it("accepts the WorkBuddy request contract and consumes API usage", async () => {
    const request = new NextRequest("http://localhost/api/agent/v1/inspiration/events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer maim_test" },
      body: JSON.stringify({
        platform: "workbuddy_wechat",
        externalChatId: "chat-1",
        externalSenderId: "sender-1",
        projectId: "project-1",
        content: "@助手 收选题 https://v.douyin.com/demo/",
        occurredAt: "2026-07-20T12:00:00.000Z",
      }),
    })
    const response = await POST(request)
    expect(response.status).toBe(202)
    expect(mocks.ingestInspirationEvent).toHaveBeenCalledWith(expect.objectContaining({ platform: "workbuddy_wechat", externalChatId: "chat-1" }), "user-1")
    expect(mocks.recordAgentApiCall).toHaveBeenCalledWith(expect.objectContaining({ action: "inspiration.events.ingest", status: "success" }))
  })
})
