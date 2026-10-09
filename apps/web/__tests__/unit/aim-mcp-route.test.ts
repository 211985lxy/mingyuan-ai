import { beforeEach, describe, expect, it, vi } from "vitest"

const flags = vi.hoisted(() => ({ enabled: true }))
const mocks = vi.hoisted(() => ({
  verifyMcpToken: vi.fn(),
  loadContextForApiKey: vi.fn(),
  projectFindMany: vi.fn(),
  resolveBoundProject: vi.fn(),
  executePreparedAimGeneration: vi.fn(),
  understandAimContentTurnWithTrace: vi.fn(),
  startAimGenerationAttempt: vi.fn(),
  listIpWikiPages: vi.fn(),
  enforceDailyBetaLimit: vi.fn(),
  executeAimRun: vi.fn(),
  executeAimChatDomain: vi.fn(),
}))

vi.mock("@/lib/aim-remote/feature-flags", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim-remote/feature-flags")>(
    "@/lib/aim-remote/feature-flags",
  )
  return { ...actual, isMcpEnabled: () => flags.enabled }
})

vi.mock("@/lib/prisma", () => ({
  prisma: {
    clientProject: { findMany: mocks.projectFindMany },
    knowledgeEntry: { findMany: vi.fn(async () => []) },
    aimMemory: { findMany: vi.fn(async () => []) },
    aimGeneration: { findFirst: vi.fn(), findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  },
}))

vi.mock("@/lib/aim-remote/mcp-auth", () => ({
  verifyMcpToken: mocks.verifyMcpToken,
  loadContextForApiKey: mocks.loadContextForApiKey,
}))

vi.mock("@/lib/internal-beta-limits", () => ({
  enforceDailyBetaLimit: mocks.enforceDailyBetaLimit,
}))

vi.mock("@/lib/account-project-context", async () => {
  const actual = await vi.importActual<typeof import("@/lib/account-project-context")>(
    "@/lib/account-project-context",
  )
  return { ...actual, resolveBoundProject: mocks.resolveBoundProject }
})

vi.mock("@/lib/aim-observability", () => ({
  createAimTrace: vi.fn(async () => ({ id: "trace-1" })),
  addAimTraceStep: vi.fn(async () => undefined),
  failAimTrace: vi.fn(async () => undefined),
  finishAimTrace: vi.fn(async () => undefined),
  logAimProjectContextRejection: vi.fn(async () => undefined),
  runAimTraceStep: vi.fn(async (_trace, _key, _label, fn: () => unknown) => fn()),
  summarizeText: vi.fn((input: unknown) => String(input ?? "")),
}))

vi.mock("@/lib/aim-generate-context", () => ({
  buildRawInputWithMarketViralContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
  buildRawInputWithVideoCopyContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
  buildRawInputWithTrendingContext: vi.fn(async (rawInput: string) => rawInput),
  buildRawInputWithCommentInsightContext: vi.fn(async (_userId: string, rawInput: string) => rawInput),
  buildRawInputWithOpportunityBrief: vi.fn((rawInput: string) => rawInput),
}))

vi.mock("@/lib/aim/services/generate-request", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim/services/generate-request")>(
    "@/lib/aim/services/generate-request",
  )
  return { ...actual, executePreparedAimGeneration: mocks.executePreparedAimGeneration }
})

vi.mock("@/lib/aim/semantic-task-understanding", () => ({
  understandAimContentTurnWithTrace: mocks.understandAimContentTurnWithTrace,
}))

vi.mock("@/lib/ip-wiki/repo", () => ({
  listIpWikiPages: mocks.listIpWikiPages,
}))

vi.mock("@/lib/aim-harness/runtime", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim-harness/runtime")>(
    "@/lib/aim-harness/runtime",
  )
  return { ...actual, executeAimRun: mocks.executeAimRun }
})

vi.mock("@/lib/aim-harness/domain-executor", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim-harness/domain-executor")>(
    "@/lib/aim-harness/domain-executor",
  )
  return { ...actual, executeAimChatDomain: mocks.executeAimChatDomain }
})

vi.mock("@/lib/aim/generation-attempt", async () => {
  const actual = await vi.importActual<typeof import("@/lib/aim/generation-attempt")>(
    "@/lib/aim/generation-attempt",
  )
  return {
    ...actual,
    startAimGenerationAttempt: mocks.startAimGenerationAttempt,
    markAimGenerationRunning: vi.fn(async () => undefined),
    markAimGenerationAwaitingInput: vi.fn(async () => undefined),
    discardAimGenerationAttempt: vi.fn(async () => undefined),
    completeAimGenerationAttempt: vi.fn(async () => undefined),
    failAimGenerationAttempt: vi.fn(async () => undefined),
  }
})

import { AccountProjectContextError } from "@/lib/account-project-context"
import { GET, POST } from "@/app/api/aim-mcp/[transport]/route"

const context = {
  apiKeyId: "key-1",
  userId: "user-1",
  boundProjectId: "proj-1",
  allowedProjects: ["proj-1"],
  allowedAgents: [
    "business_system_diagnosis",
    "business_diagnosis",
    "content_producer",
    "free_copywriter",
    "work_editor",
    "content_review",
    "content_retro",
  ],
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

function tool(name: string, args: Record<string, unknown>) {
  return mcp("tools/call", { name, arguments: args })
}

function pageRun(content: string, format = "raw_copy") {
  return {
    output: {
      id: "gen-1",
      results: [{ format, content, wordCount: content.trim().length }],
      knowledgeUsed: [],
    },
    metadata: { runId: "run-1", degraded: false, provider: "test", model: "test" },
    traceId: "trace-1",
    qualityStatus: "skipped" as const,
    qualityChecks: [],
  }
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
    mocks.resolveBoundProject.mockResolvedValue({ id: "proj-1", name: "示例项目", status: "active" })
    mocks.enforceDailyBetaLimit.mockResolvedValue(null)
    mocks.listIpWikiPages.mockResolvedValue([
      { pageType: "audience", content: "核心客户：实体店老板" },
      { pageType: "positioning", content: "核心定位：帮老板把经验变成获客内容。" },
    ])
    mocks.understandAimContentTurnWithTrace.mockResolvedValue({
      handling: "deliver",
      brief: "按用户素材直接生成。",
    })
    mocks.startAimGenerationAttempt.mockResolvedValue({
      id: "generated-attempt",
      created: true,
      replay: "continue",
    })
    mocks.executePreparedAimGeneration.mockImplementation(async (prepared: { parsed: { targetFormats: string[] } }) => (
      pageRun("改好的正文", prepared.parsed.targetFormats[0] || "raw_copy")
    ))
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
    expect(mocks.executePreparedAimGeneration).not.toHaveBeenCalled()
  })

  it("lists the same actions the signed-in site can start", async () => {
    const initialized = await mcp("initialize", {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "unit", version: "0" },
    })
    expect(initialized.status).toBe(200)
    expect((await initialized.json()).result.instructions).toContain("不允许自动发布")

    const names = (await (await mcp("tools/list")).json()).result.tools.map((item: { name: string }) => item.name)
    for (const name of [
      "aim_start",
      "aim_chat",
      "aim_business_diagnosis_core",
      "aim_benchmark_topic_pool",
      "aim_traffic_funnel",
      "aim_text_polish",
      "aim_forbidden_word_audit",
      "aim_wechat_layout",
      "aim_full_publish_review",
      "aim_single_content_retro",
      "aim_publish",
      "aim_feishu_write",
      "aim_knowledge_edit",
      "aim_ip_plan_edit",
      "aim_batch_script_studio",
      "aim_market_benchmark_search",
    ]) {
      expect(names).toContain(name)
    }
    expect(names).not.toContain("aim_draft_submit")
    expect(names).not.toContain("aim_work_editor_start")
    expect(names).not.toContain("asset_create")
    expect(names).not.toContain("asset_verify")
  })

  it("polishes a draft through the page generate path and returns the copy", async () => {
    const response = await tool("aim_text_polish", { material: "今天聊聊怎么把成稿改顺。" })
    const body = await response.json()
    expect(body.result.isError).toBeUndefined()
    expect(body.result.content[0].text).toContain("改好的正文")
    expect(body.result.content[0].text).toContain("还没发布")
    expect(mocks.executePreparedAimGeneration).toHaveBeenCalledWith(expect.objectContaining({
      userId: "user-1",
      parsed: expect.objectContaining({
        agentId: "work_editor",
        targetFormats: ["raw_copy"],
        rawInput: expect.stringContaining("今天聊聊怎么把成稿改顺。"),
      }),
    }))
    const rawInput = mocks.executePreparedAimGeneration.mock.calls[0][0].parsed.rawInput as string
    expect(rawInput).toContain("去 AI 味")
  })

  it("sends the other main stages through the same page executor", async () => {
    await tool("aim_wechat_layout", { material: "一段要排进公众号的成稿。" })
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      parsed: expect.objectContaining({ agentId: "work_editor", targetFormats: ["raw_copy"] }),
    }))

    await tool("aim_full_publish_review", { material: "一段待检口播。" })
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      parsed: expect.objectContaining({ agentId: "content_review", targetFormats: ["raw_copy"] }),
    }))

    await tool("aim_single_content_retro", { material: "这条发出去播放 1200，评论 3 条。" })
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      userId: "user-1",
      parsed: expect.objectContaining({ agentId: "content_retro", targetFormats: ["raw_copy"] }),
    }))

    const diagnosis = await tool("aim_business_diagnosis_core", {
      material: "老板 IP 做了三个月没成交，想先找流量和成交卡在哪。",
    })
    expect((await diagnosis.json()).result.content[0].text).toContain("改好的正文")
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      userId: "user-1",
      parsed: expect.objectContaining({ agentId: "business_system_diagnosis" }),
    }))

    const topics = await tool("aim_benchmark_topic_pool", {
      material: "目标客户是实体店老板，想整理可拍选题，不要写正文。",
    })
    expect((await topics.json()).result.isError).toBeUndefined()
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      parsed: expect.objectContaining({ agentId: "business_diagnosis", targetFormats: ["raw_copy"] }),
    }))

    const copy = await tool("aim_traffic_funnel", {
      material: "写一条讲门店获客的口播，写给实体店老板，目标是引流获客。",
    })
    const copyBody = await copy.json()
    expect(copyBody.result.isError).toBeUndefined()
    expect(copyBody.result.content[0].text).toContain("改好的正文")
    expect(mocks.executePreparedAimGeneration).toHaveBeenLastCalledWith(expect.objectContaining({
      userId: "user-1",
      parsed: expect.objectContaining({ agentId: "content_producer", targetFormats: ["video_script"] }),
    }))
  })

  it("says publish, feishu, knowledge and plan edits are not allowed", async () => {
    for (const name of ["aim_publish", "aim_feishu_write", "aim_knowledge_edit", "aim_ip_plan_edit"]) {
      const body = await (await tool(name, { material: "有正文也不许做这件事。" })).json()
      expect(body.result.isError).toBe(true)
      expect(body.result.content[0].text).toContain("不允许")
    }
    const panel = await (await tool("aim_batch_script_studio", { material: "三条素材" })).json()
    expect(panel.result.isError).toBe(true)
    expect(panel.result.content[0].text).toContain("网页")
    expect(mocks.executePreparedAimGeneration).not.toHaveBeenCalled()
  })

  it("fails an empty draft and an account with no project instead of succeeding", async () => {
    const emptyDraft = await (await tool("aim_text_polish", { material: "   " })).json()
    expect(emptyDraft.result.isError).toBe(true)
    expect(emptyDraft.result.content[0].text).toContain("还没有成稿")

    const emptyBrief = await (await tool("aim_traffic_funnel", { material: "" })).json()
    expect(emptyBrief.result.isError).toBe(true)
    expect(emptyBrief.result.content[0].text).toContain("还没有素材")

    mocks.resolveBoundProject.mockRejectedValue(
      new AccountProjectContextError("ACCOUNT_PROJECT_SETUP_REQUIRED", "账号尚未绑定项目，请先完成项目设置"),
    )
    const noProject = await (await tool("aim_text_polish", { material: "有正文，但是没有项目。" })).json()
    expect(noProject.result.isError).toBe(true)
    expect(noProject.result.content[0].text).toContain("尚未绑定项目")
    expect(mocks.executePreparedAimGeneration).not.toHaveBeenCalled()
  })

  it("answers a question through the page send path and keeps the draft in view", async () => {
    mocks.executeAimRun.mockImplementation(async (_request: unknown, domain: (spec: unknown) => Promise<unknown>) => {
      await domain({})
      return {
        output: "结构是三句话：先讲卡点，再讲做法，最后讲下一步。",
        metadata: { runId: "chat-1", degraded: false, provider: "test", model: "test" },
      }
    })
    const response = await tool("aim_chat", {
      agent: "work_editor",
      message: "结构怎么拆",
      draft: "先说客户为什么不来，再说你怎么把人留下来，最后约一次到店。",
    })
    const body = await response.json()
    expect(body.result.isError).toBeUndefined()
    expect(body.result.content[0].text).toContain("结构是三句话")
    expect(mocks.executePreparedAimGeneration).not.toHaveBeenCalled()
    expect(mocks.enforceDailyBetaLimit).toHaveBeenCalledWith("user-1", "aim_chat")
    expect(mocks.executeAimChatDomain).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        userId: "user-1",
        knowledgeBlock: expect.stringContaining("先说客户为什么不来"),
      }),
      expect.anything(),
    )
  })

  it("refuses to send a feishu or knowledge write through the chat box", async () => {
    const feishu = await (await tool("aim_chat", {
      agent: "work_editor",
      message: "把这篇同步到飞书",
      draft: "一段成稿",
    })).json()
    expect(feishu.result.isError).toBe(true)
    expect(feishu.result.content[0].text).toContain("不允许写入飞书")

    const knowledge = await (await tool("aim_chat", {
      agent: "content_retro",
      message: "沉淀到知识库",
    })).json()
    expect(knowledge.result.isError).toBe(true)
    expect(knowledge.result.content[0].text).toContain("不允许修改知识库")
    expect(mocks.executeAimRun).not.toHaveBeenCalled()
  })

  it("fails an empty chat and a blank reply", async () => {
    const empty = await (await tool("aim_chat", { agent: "work_editor", message: "   " })).json()
    expect(empty.result.isError).toBe(true)
    expect(empty.result.content[0].text).toContain("还没有要说的话")

    mocks.executeAimRun.mockResolvedValueOnce({
      output: "   ",
      metadata: { runId: "chat-empty", degraded: false, provider: "test", model: "test" },
    })
    const blank = await (await tool("aim_chat", { agent: "work_editor", message: "在吗" })).json()
    expect(blank.result.isError).toBe(true)
    expect(blank.result.content[0].text).toContain("空结果不算成功")
  })

  it("treats a finished page run with no copy as a failure", async () => {
    mocks.executePreparedAimGeneration.mockResolvedValueOnce(pageRun("   "))
    const empty = await (await tool("aim_text_polish", { material: "有正文，但模型交了白卷。" })).json()
    expect(empty.result.isError).toBe(true)
    expect(empty.result.content[0].text).toContain("空结果不算成功")
  })
})
