import { beforeEach, describe, expect, it, vi } from "vitest"

const flags = vi.hoisted(() => ({ enabled: true }))
const mocks = vi.hoisted(() => ({
  submitInvocation: vi.fn(),
  getInvocation: vi.fn(),
  verifyMcpToken: vi.fn(),
  loadContextForApiKey: vi.fn(),
  projectFindMany: vi.fn(),
}))

vi.mock("@/lib/aim-remote/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim-remote/feature-flags")>(
    "@/lib/aim-remote/feature-flags",
  )
  return { ...actual, isMcpEnabled: () => flags.enabled }
})

vi.mock("@/lib/prisma", () => ({
  prisma: { clientProject: { findMany: mocks.projectFindMany } },
}))

vi.mock("@/lib/aim-remote/mcp-auth", () => ({
  verifyMcpToken: mocks.verifyMcpToken,
  loadContextForApiKey: mocks.loadContextForApiKey,
}))

vi.mock("@/lib/aim-remote/invocation-service", () => ({
  submitInvocation: mocks.submitInvocation,
  getInvocation: mocks.getInvocation,
  invocationResultsAreEmpty: (results?: Array<{ content: string }>) =>
    !results || results.length === 0 || results.every((item) => item.content.trim().length === 0),
}))

import { GET, POST } from "@/app/api/aim-mcp/[transport]/route"

const context = {
  apiKeyId: "key-1",
  userId: "user-1",
  boundProjectId: "proj-1",
  allowedProjects: ["proj-1"],
  allowedAgents: ["work_editor", "content_review"],
  clientType: "codex",
  allowedScopes: [],
  expiresAt: null,
  maxInputChars: 50_000,
  minuteLimit: 60,
  dailyTokenLimit: null,
}

function mcp(method: string, params?: unknown, token = "maim_unit_test_key") {
  return POST(new Request("http://mingyuan-ai.cn/api/aim-mcp/mcp", {
    method: "POST",
    headers: {
      host: "mingyuan-ai.cn",
      "content-type": "application/json",
      authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }))
}

describe("AIM MCP route", () => {
  beforeEach(() => {
    flags.enabled = true
    vi.clearAllMocks()
    mocks.verifyMcpToken.mockImplementation(async (_request: Request, token?: string) => {
      if (!token?.startsWith("maim_")) return undefined
      return { token, clientId: "key-1", apiKeyId: "key-1", scopes: [], __aim: true }
    })
    mocks.loadContextForApiKey.mockResolvedValue(context)
    mocks.projectFindMany.mockResolvedValue([{ id: "proj-1", name: "示例项目" }])
    mocks.submitInvocation.mockResolvedValue({
      ok: true,
      created: true,
      response: {
        invocationId: "inv-1",
        status: "queued",
        pollAfterSeconds: 8,
        warnings: ["draft_only"],
        requiresHumanReview: true,
      },
    })
  })

  it("stays dark until AIM_MCP_ENABLED=true and tells the operator how to turn it on", async () => {
    flags.enabled = false
    const response = await GET(new Request("http://mingyuan-ai.cn/api/aim-mcp/mcp"))
    expect(response.status).toBe(503)
    const body = await response.json()
    expect(body.error).toBe("MCP surface is disabled")
    expect(body.hint).toContain("AIM_MCP_ENABLED=true")
    expect(body.hint).toContain("maim_")
  })

  it("rejects a missing key even after the surface is on", async () => {
    const response = await mcp("initialize", {}, "")
    expect(response.status).toBe(401)
    expect(mocks.submitInvocation).not.toHaveBeenCalled()
  })

  it("initializes and lists the work-editor tool for a valid key", async () => {
    const initialized = await mcp("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "unit", version: "0" },
    })
    expect(initialized.status).toBe(200)
    const initBody = await initialized.json()
    expect(initBody.result.protocolVersion).toBe("2025-03-26")
    expect(initBody.result.serverInfo.name).toBe("mingyuan-aim")
    expect(initBody.result.instructions).toContain("不允许自动发布")

    const listed = await mcp("tools/list")
    const names = (await listed.json()).result.tools.map((tool: { name: string }) => tool.name)
    expect(names).toContain("aim_work_editor_start")
    expect(names).toContain("aim_capabilities")
    expect(names).not.toContain("asset_create")
    expect(names).not.toContain("asset_verify")
  })

  it("starts a polish job from the pasted draft and does not publish", async () => {
    const response = await mcp("tools/call", {
      name: "aim_work_editor_start",
      arguments: { action: "text_polish", draft: "今天聊聊怎么把成稿改顺。" },
    })
    const body = await response.json()
    expect(body.result.isError).toBeUndefined()
    expect(body.result.content[0].text).toContain("不会发布")
    expect(mocks.submitInvocation).toHaveBeenCalledWith(context, expect.objectContaining({
      projectId: "proj-1",
      agentId: "work_editor",
      rawInput: "今天聊聊怎么把成稿改顺。",
      targetFormats: ["raw_copy"],
    }))
    const instruction = mocks.submitInvocation.mock.calls[0][1].instruction as string
    expect(instruction).toContain("去 AI 味")
    expect(instruction).toContain("不要宣称已经发布")
  })

  it("sends wechat layout to the work editor and pre-publish review to the review agent", async () => {
    await mcp("tools/call", {
      name: "aim_work_editor_start",
      arguments: { action: "wechat_layout", draft: "一段要排进公众号的成稿。" },
    })
    expect(mocks.submitInvocation).toHaveBeenLastCalledWith(context, expect.objectContaining({
      agentId: "work_editor",
      targetFormats: ["wechat_article"],
    }))

    await mcp("tools/call", {
      name: "aim_work_editor_start",
      arguments: { action: "full_publish_review", draft: "一段待检口播。" },
    })
    expect(mocks.submitInvocation).toHaveBeenLastCalledWith(context, expect.objectContaining({
      agentId: "content_review",
      targetFormats: ["raw_copy"],
    }))
  })

  it("says publish, feishu, knowledge and plan edits are not allowed", async () => {
    for (const action of ["publish", "feishu_write", "knowledge_edit", "ip_plan_edit"]) {
      const response = await mcp("tools/call", {
        name: "aim_work_editor_start",
        arguments: { action, draft: "有正文也不许做这件事。" },
      })
      const body = await response.json()
      expect(body.result.isError).toBe(true)
      expect(body.result.content[0].text).toContain("不允许")
    }
    expect(mocks.submitInvocation).not.toHaveBeenCalled()
  })

  it("fails an empty draft and an account with no project instead of succeeding", async () => {
    const emptyDraft = await (await mcp("tools/call", {
      name: "aim_work_editor_start",
      arguments: { action: "text_polish", draft: "   " },
    })).json()
    expect(emptyDraft.result.isError).toBe(true)
    expect(emptyDraft.result.content[0].text).toContain("还没有成稿")

    mocks.loadContextForApiKey.mockResolvedValue({ ...context, boundProjectId: null, allowedProjects: [] })
    const noProject = await (await mcp("tools/call", {
      name: "aim_work_editor_start",
      arguments: { action: "text_polish", draft: "有正文，但是没有项目。" },
    })).json()
    expect(noProject.result.isError).toBe(true)
    expect(noProject.result.content[0].text).toContain("还没有绑定项目")
    expect(mocks.submitInvocation).not.toHaveBeenCalled()
  })

  it("treats a finished call with no copy as a failure, and returns the draft when there is one", async () => {
    mocks.getInvocation.mockResolvedValueOnce({
      invocationId: "inv-empty",
      status: "succeeded",
      pollAfterSeconds: 8,
      results: [],
      warnings: ["draft_only"],
      requiresHumanReview: true,
    })
    const empty = await (await mcp("tools/call", {
      name: "aim_invocation_get",
      arguments: { invocationId: "inv-empty" },
    })).json()
    expect(empty.result.isError).toBe(true)
    expect(empty.result.content[0].text).toContain("空结果不算成功")

    mocks.getInvocation.mockResolvedValueOnce({
      invocationId: "inv-done",
      status: "succeeded",
      pollAfterSeconds: 8,
      results: [{ format: "raw_copy", content: "改好的正文" }],
      warnings: ["draft_only"],
      requiresHumanReview: true,
    })
    const done = await (await mcp("tools/call", {
      name: "aim_invocation_get",
      arguments: { invocationId: "inv-done" },
    })).json()
    expect(done.result.isError).toBeUndefined()
    expect(done.result.content[0].text).toContain("改好的正文")
    expect(done.result.content[0].text).toContain("尚未发布")
  })

  it("rejects a host that only looks like the production domain", async () => {
    const response = await POST(new Request("http://evilmingyuan-ai.cn/api/aim-mcp/mcp", {
      method: "POST",
      headers: {
        host: "evilmingyuan-ai.cn",
        "content-type": "application/json",
        authorization: "Bearer maim_unit_test_key",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }))
    expect(response.status).toBe(403)
  })
})
