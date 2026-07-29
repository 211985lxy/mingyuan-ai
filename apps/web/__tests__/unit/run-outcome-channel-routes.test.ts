import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const {
  authenticateAgentRequest,
  assertAgentScope,
  assertAgentProjectAccess,
  recordAgentApiCall,
  agentAuthErrorResponse,
  findRunOutcomeOwner,
  writeFinalRunOutcome,
  resolveBotByVerificationToken,
} = vi.hoisted(() => ({
  authenticateAgentRequest: vi.fn(),
  assertAgentScope: vi.fn(),
  assertAgentProjectAccess: vi.fn(),
  recordAgentApiCall: vi.fn(),
  agentAuthErrorResponse: vi.fn(() => null),
  findRunOutcomeOwner: vi.fn(),
  writeFinalRunOutcome: vi.fn(),
  resolveBotByVerificationToken: vi.fn(),
}))

vi.mock("@/lib/agent-api-auth", () => ({
  authenticateAgentRequest,
  assertAgentScope,
  assertAgentProjectAccess,
  recordAgentApiCall,
  agentAuthErrorResponse,
}))
vi.mock("@/lib/aim/run-outcome-write-service", () => ({
  findRunOutcomeOwner,
  writeFinalRunOutcome,
}))
vi.mock("@/lib/feishu-agent-registry", () => ({ resolveBotByVerificationToken }))

import { POST as postAgentOutcome } from "@/app/api/agent/v1/aim/runs/[runId]/outcome/route"
import { POST as postFeishuOutcome } from "@/app/api/integrations/feishu/run-outcomes/route"

const metadata = {
  workflowId: "content-growth-v1",
  taskType: "write_script",
  finalDisposition: "rejected",
  humanActiveMinutes: 8,
  requestId: "req-1",
}

describe("run outcome channel routes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authenticateAgentRequest.mockResolvedValue({
      apiKeyId: "key-1",
      userId: "user-1",
      allowedProjects: ["project-1"],
      allowedAgents: [],
      allowedScopes: [],
    })
    findRunOutcomeOwner.mockResolvedValue({ userId: "user-1", projectId: "project-1" })
    writeFinalRunOutcome.mockResolvedValue({ ok: true, id: "event-1", deduped: false })
    resolveBotByVerificationToken.mockReturnValue({ botId: "content_growth" })
  })

  it("agent API enforces scope/project and forces api channel", async () => {
    const response = await postAgentOutcome(
      new NextRequest("http://localhost/api/agent/v1/aim/runs/run_1/outcome", {
        method: "POST",
        body: JSON.stringify({ ...metadata, channel: "web" }),
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    )
    expect(response.status).toBe(201)
    expect(assertAgentScope).toHaveBeenCalledWith(expect.anything(), "outcomes.write")
    expect(assertAgentProjectAccess).toHaveBeenCalledWith(expect.anything(), "project-1")
    expect(writeFinalRunOutcome).toHaveBeenCalledWith(expect.objectContaining({
      channel: "api",
      outcome: expect.objectContaining({ channel: "api" }),
    }))
  })

  it("agent API rejects a run owned by another user", async () => {
    findRunOutcomeOwner.mockResolvedValueOnce({ userId: "user-2", projectId: "project-1" })
    const response = await postAgentOutcome(
      new NextRequest("http://localhost/api/agent/v1/aim/runs/run_1/outcome", {
        method: "POST",
        body: JSON.stringify(metadata),
      }),
      { params: Promise.resolve({ runId: "run_1" }) },
    )
    expect(response.status).toBe(404)
    expect(assertAgentProjectAccess).not.toHaveBeenCalled()
    expect(writeFinalRunOutcome).not.toHaveBeenCalled()
  })

  it("Feishu requires signed bot and real operator, then forces feishu channel", async () => {
    const request = new Request("http://localhost/api/integrations/feishu/run-outcomes", {
      method: "POST",
      body: JSON.stringify({
        token: "valid",
        open_id: "ou_real",
        open_message_id: "msg-1",
        action: { value: { ...metadata, runId: "run_1", action: "reject", channel: "api" } },
      }),
    })
    const response = await postFeishuOutcome(request)
    expect(response.status).toBe(201)
    expect(writeFinalRunOutcome).toHaveBeenCalledWith(expect.objectContaining({
      channel: "feishu",
      outcome: expect.objectContaining({ channel: "feishu" }),
    }))
  })

  it("Feishu rejects anonymous outcome reporting", async () => {
    const response = await postFeishuOutcome(new Request(
      "http://localhost/api/integrations/feishu/run-outcomes",
      {
        method: "POST",
        body: JSON.stringify({ token: "valid", action: { value: { ...metadata, runId: "run_1" } } }),
      },
    ))
    expect(response.status).toBe(400)
    expect(writeFinalRunOutcome).not.toHaveBeenCalled()
  })
})
