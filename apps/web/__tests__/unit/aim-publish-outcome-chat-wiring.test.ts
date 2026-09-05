/**
 * content_retro 发布数据 → chat 上下文装配 → chatParams 接线测试。
 *
 * 钉死：
 * 1. 有明确目标 + 已登记数据 → publishOutcomeBlock 进到 handler 参数
 * 2. 拿不到目标内容 → 不查库，走未登记
 * 3. null ≠ 0（装配后的 block 语义）
 * 4. 非复盘引擎 → 完全不查，装配字段与无发布数据路径一致
 * 5. 跨引擎委托到 content_retro → 仍能读到数据
 * 6. 换 userId 拿不到别人的数据
 * 7. WP-D：线索归因记录（含归因方式）随区块进入复盘上下文；只有归因也算有数据
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
  findFirst,
  findAttributions,
  resolveAimConversationIntent,
  buildAimKnowledgeContext,
  getStyleProfileBlock,
  formatEditorContextForPrompt,
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
} = vi.hoisted(() => ({
  findFirst: vi.fn(),
  findAttributions: vi.fn(async () => []),
  resolveAimConversationIntent: vi.fn(async () => ({
    mode: "chat",
    reason: "test",
    confidence: 1,
    useKnowledge: false,
    useMethodology: false,
    useLongTermMemory: false,
    useStyleProfile: false,
  })),
  buildAimKnowledgeContext: vi.fn(async () => ({ knowledgeBlock: "", entries: [], source: "skipped" })),
  getStyleProfileBlock: vi.fn(async () => ""),
  formatEditorContextForPrompt: vi.fn(async () => ""),
  retrieveAimMemory: vi.fn(async () => []),
  retrieveLayeredAimMemory: vi.fn(async () => []),
  formatAimMemoryBlock: vi.fn(() => ""),
  resolveMethodologyPolicy: vi.fn(async () => ({ versionRows: [] })),
  buildMethodologyProfileBlock: vi.fn(() => ""),
  resolveAimRuntimeTask: vi.fn(() => "rewrite_copy"),
  shouldUseKnowledgeContextForTask: vi.fn(() => false),
  shouldUseMarketViralContextForTask: vi.fn(() => false),
}))

vi.mock("@/lib/prisma", () => ({
  prisma: {
    aimGeneration: { findFirst },
    outcomeAttribution: { findMany: findAttributions },
    // 方案 A 自有账号平台表现：接线后复盘轮会读绑定表；测试默认无绑定（引导文案分支，hasData=false 不进块）
    douyinAccountBinding: { findFirst: vi.fn(async () => null), update: vi.fn(async () => ({})) },
  },
}))
vi.mock("@/lib/douyin-openapi", () => ({
  refreshDouyinAccessToken: vi.fn(),
  fetchDouyinRecentVideos: vi.fn(async () => []),
}))

vi.mock("@/lib/aim-conversation-intent", () => ({ resolveAimConversationIntent }))
vi.mock("@/lib/aim-knowledge-context", () => ({ buildAimKnowledgeContext }))
vi.mock("@/lib/aim-competitor-watch-context", () => ({ buildAimCompetitorWatchContext: vi.fn(async () => "") }))
vi.mock("@/lib/style-profile", () => ({ getStyleProfileBlock }))
vi.mock("@/lib/aim-editor", () => ({ formatEditorContextForPrompt }))
vi.mock("@/lib/aim-memory", () => ({
  retrieveAimMemory,
  retrieveLayeredAimMemory,
  formatAimMemoryBlock,
  persistMemoriesFromConversation: vi.fn(async () => undefined),
}))
vi.mock("@/lib/methodology-profile-store", () => ({
  resolveMethodologyPolicy,
  buildMethodologyProfileBlock,
}))
vi.mock("@/lib/aim-knowledge-strategy", () => ({
  resolveAimRuntimeTask,
  shouldUseKnowledgeContextForTask,
  shouldUseMarketViralContextForTask,
}))
vi.mock("@/lib/aim-observability", () => ({
  runAimTraceStep: vi.fn(async (_t: unknown, _k: string, _l: string, fn: () => unknown) => fn()),
  addAimTraceStep: vi.fn(async () => undefined),
  finishAimTrace: vi.fn(async () => undefined),
}))

import { assembleAimChatContext } from "@/lib/aim/services/chat/context-assembly"
import { prepareAimChatExecution } from "@/lib/aim/services/chat/execution"
import { buildContentRetroChatPrompt } from "@/lib/aim-agent-content-retro-prompts"
import {
  shouldLoadPublishOutcomeContext,
  resolvePublishOutcomeBlock,
} from "@/lib/aim/content-outcome-context"

function registeredOutcome(overrides: Record<string, unknown> = {}) {
  return {
    collectWindowDay: 7,
    platform: "抖音",
    publishedAt: new Date("2026-07-01T00:00:00.000Z"),
    qualifiedCommentCount: 4,
    dmCount: 2,
    qualifiedLeadCount: 1,
    appointmentCount: 1,
    dealCount: 1,
    revenue: 9800,
    views: 1200,
    likes: 88,
    comments: 16,
    saves: 9,
    shares: 5,
    audienceFeedback: "用户追问了报价",
    userVerdict: null,
    verdictNote: "转化效果不错",
    verdictCode: "effective",
    ...overrides,
  }
}

async function assembleRetro(input: {
  userId?: string
  agentId?: string
  executionAgentId?: string
  targetGenerationId?: string
}) {
  return assembleAimChatContext({
    userId: input.userId ?? "user-1",
    projectId: "p1",
    agentId: input.agentId ?? "content_retro",
    executionAgentId: input.executionAgentId,
    messages: [{ role: "user", content: "帮我复盘这条内容" }],
    targetGenerationId: input.targetGenerationId,
  })
}

describe("shouldLoadPublishOutcomeContext 门闩", () => {
  it("只有复盘引擎且有 generationId 才允许读库", () => {
    expect(shouldLoadPublishOutcomeContext("content_retro", "gen-1")).toBe(true)
    expect(shouldLoadPublishOutcomeContext("content_retro", "  ")).toBe(false)
    expect(shouldLoadPublishOutcomeContext("content_retro", undefined)).toBe(false)
    expect(shouldLoadPublishOutcomeContext("content_producer", "gen-1")).toBe(false)
  })
})

describe("content_retro chat 发布数据接线", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findFirst.mockReset()
  })

  it("有明确目标 + 已登记数据 → publishOutcomeBlock 进到 handler 参数且含真实数字", async () => {
    findFirst.mockResolvedValue({
      retroSnapshots: [],
      contentOutcomes: [registeredOutcome()],
    })

    const context = await assembleRetro({ targetGenerationId: "gen-owned" })
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "gen-owned", userId: "user-1" },
      }),
    )
    expect(context.publishOutcomeBlock).toContain("播放 1200 次")
    expect(context.publishOutcomeBlock).toContain("营收 9800 元")

    const exec = prepareAimChatExecution({
      context,
      userId: "user-1",
      projectId: "p1",
      agentId: "content_retro",
      shouldStream: false,
    })
    expect(exec.chatParams.publishOutcomeBlock).toContain("播放 1200 次")

    const prompt = buildContentRetroChatPrompt({
      contextBlock: "",
      publishOutcomeBlock: exec.chatParams.publishOutcomeBlock,
    })
    expect(prompt).toContain("播放 1200 次")
    expect(prompt).not.toContain("请先去登记")
  })

  it("拿不到目标内容 → 不查库，走未登记分支", async () => {
    const context = await assembleRetro({ targetGenerationId: undefined })
    expect(findFirst).not.toHaveBeenCalled()
    expect(context.publishOutcomeBlock).toBeUndefined()

    const exec = prepareAimChatExecution({
      context,
      userId: "user-1",
      projectId: "p1",
      agentId: "content_retro",
      shouldStream: false,
    })
    expect(exec.chatParams.publishOutcomeBlock).toBeUndefined()

    const prompt = buildContentRetroChatPrompt({
      contextBlock: "",
      publishOutcomeBlock: exec.chatParams.publishOutcomeBlock,
    })
    expect(prompt).toContain("未登记发布数据")
    expect(prompt).toContain("请先去登记")
  })

  it("已登记数据里 null 输出未填写，真实 0 输出 0", async () => {
    findFirst.mockResolvedValue({
      retroSnapshots: [],
      contentOutcomes: [
        registeredOutcome({ views: null, likes: 0, revenue: null, dealCount: 0 }),
      ],
    })

    const block = await resolvePublishOutcomeBlock({
      executionAgentId: "content_retro",
      userId: "user-1",
      generationId: "gen-1",
    })
    expect(block).toContain("播放 未填写 次")
    expect(block).toContain("点赞 0 次")
    expect(block).toContain("营收 未填写 元")
    expect(block).toContain("成交 0 单")
    expect(block).not.toContain("播放 0 次")
  })

  it("WP-D：已登记线索归因按用户隔离读出并进入区块", async () => {
    findFirst.mockResolvedValue({
      retroSnapshots: [],
      contentOutcomes: [registeredOutcome()],
    })
    findAttributions.mockResolvedValue([
      {
        externalLeadId: "wx-lead-01",
        externalDealId: "deal-9",
        externalPaymentId: null,
        attributionMethod: "explicit",
        occurredAt: new Date("2026-08-20T00:00:00.000Z"),
      },
      {
        externalLeadId: "wx-lead-02",
        externalDealId: null,
        externalPaymentId: null,
        attributionMethod: "unknown",
        occurredAt: new Date("2026-08-21T00:00:00.000Z"),
      },
    ])

    const block = await resolvePublishOutcomeBlock({
      executionAgentId: "content_retro",
      userId: "user-1",
      generationId: "gen-1",
    })

    expect(findAttributions).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { generationId: "gen-1", userId: "user-1" },
      }),
    )
    expect(block).toContain("线索归因：共 2 条登记")
    expect(block).toContain("线索「wx-lead-01」｜明确归因｜已挂成交/回款")
    expect(block).toContain("线索「wx-lead-02」｜来源不明｜未挂成交")
    expect(block).not.toContain("线索归因：未登记")
  })

  it("WP-D：只有线索归因、发布数据未登记也算有数据，不让复盘走编数分支", async () => {
    findFirst.mockResolvedValue({
      retroSnapshots: [],
      contentOutcomes: [],
    })
    findAttributions.mockResolvedValue([
      {
        externalLeadId: "wx-lead-03",
        externalDealId: null,
        externalPaymentId: null,
        attributionMethod: "first_touch",
        occurredAt: new Date("2026-08-22T00:00:00.000Z"),
      },
    ])

    const block = await resolvePublishOutcomeBlock({
      executionAgentId: "content_retro",
      userId: "user-1",
      generationId: "gen-1",
    })

    expect(block).toBeDefined()
    expect(block).toContain("线索「wx-lead-03」｜首触归因｜未挂成交")
    expect(block).not.toContain("请先去登记")
  })

  it("非 content_retro 普通会话 → 不查发布数据，装配字段与无目标路径一致", async () => {
    const withTarget = await assembleAimChatContext({
      userId: "user-1",
      projectId: "p1",
      agentId: "content_producer",
      messages: [{ role: "user", content: "写一条口播" }],
      targetGenerationId: "gen-should-ignore",
    })
    const withoutTarget = await assembleAimChatContext({
      userId: "user-1",
      projectId: "p1",
      agentId: "content_producer",
      messages: [{ role: "user", content: "写一条口播" }],
    })

    expect(findFirst).not.toHaveBeenCalled()
    expect(withTarget).toEqual(withoutTarget)
    expect(withTarget.publishOutcomeBlock).toBeUndefined()

    const exec = prepareAimChatExecution({
      context: withTarget,
      userId: "user-1",
      projectId: "p1",
      agentId: "content_producer",
      shouldStream: false,
    })
    expect(exec.chatParams).toEqual(
      expect.objectContaining({ publishOutcomeBlock: undefined }),
    )
  })

  it("从别的智能体委托到 content_retro → 仍能拿到发布数据", async () => {
    findFirst.mockResolvedValue({
      retroSnapshots: [],
      contentOutcomes: [registeredOutcome({ views: 555 })],
    })

    const context = await assembleRetro({
      agentId: "work_editor",
      executionAgentId: "content_retro",
      targetGenerationId: "gen-delegated",
    })

    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "gen-delegated", userId: "user-1" },
      }),
    )
    expect(context.publishOutcomeBlock).toContain("播放 555 次")

    const exec = prepareAimChatExecution({
      context,
      userId: "user-1",
      projectId: "p1",
      agentId: "work_editor",
      executionAgentId: "content_retro",
      shouldStream: false,
    })
    expect(exec.chatParams.publishOutcomeBlock).toContain("播放 555 次")
    expect(exec.runRequest.agentId).toBe("content_retro")
  })

  it("数据只属于当前用户：换 userId 查不到", async () => {
    findFirst.mockImplementation(async (args: { where: { userId: string } }) => {
      if (args.where.userId !== "user-1") return null
      return {
        retroSnapshots: [],
        contentOutcomes: [registeredOutcome({ views: 777 })],
      }
    })

    const own = await resolvePublishOutcomeBlock({
      executionAgentId: "content_retro",
      userId: "user-1",
      generationId: "gen-1",
    })
    const other = await resolvePublishOutcomeBlock({
      executionAgentId: "content_retro",
      userId: "user-other",
      generationId: "gen-1",
    })

    expect(own).toContain("播放 777 次")
    expect(other).toBeUndefined()
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "gen-1", userId: "user-other" } }),
    )
  })

  it("读库失败向上抛，不静默当成未登记", async () => {
    findFirst.mockRejectedValue(new Error("db unavailable"))
    await expect(
      resolvePublishOutcomeBlock({
        executionAgentId: "content_retro",
        userId: "user-1",
        generationId: "gen-1",
      }),
    ).rejects.toThrow("db unavailable")
  })
})
