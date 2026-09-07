import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Task 4 — model-context builders must only include rows of the bound project.
 *
 * `projectId: null` or `project-b` rows of the SAME user must never reach the
 * model prompt. A builder that queries by `userId` alone "leaks" the foreign
 * rows and the assertions below fail (genuine RED).
 */

// ---------------------------------------------------------------------------
// In-memory prisma double enforcing where clauses
// ---------------------------------------------------------------------------
type Row = Record<string, unknown> & { id: string }

function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
  if (!where) return true
  for (const [key, condition] of Object.entries(where)) {
    if (condition && typeof condition === "object" && !(condition as Row).id) continue
    if (row[key] !== condition) return false
  }
  return true
}

function makeTable(seed: Row[]) {
  const rows = seed.map((r) => ({ ...r }))
  return {
    findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
      let out = rows.filter((r) => matchesWhere(r, where))
      if (take !== undefined) out = out.slice(0, take)
      return out
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
      rows.find((r) => matchesWhere(r, where)) ?? null),
    create: vi.fn(),
  }
}

const DB = vi.hoisted(() => {
  const now = new Date("2026-09-01T00:00:00.000Z")
  const watchAccounts = makeTable([
    {
      id: "wa-a",
      userId: "user-1",
      projectId: "project-a",
      nickname: "对标A",
      platform: "douyin",
      targetUrl: "https://a",
      latestVideos: [{ videoId: "va", title: "A项目作品", createTime: 1780000000 }],
      viralVideos: [{ title: "A项目爆款", videoUrl: "https://a/v1", likes: 1000, engagementScore: 1000 }],
      lastRefreshedAt: now,
      refreshStatus: "success",
    },
    {
      id: "wa-b",
      userId: "user-1",
      projectId: "project-b",
      nickname: "B项目账号",
      platform: "douyin",
      targetUrl: "https://b",
      latestVideos: [{ videoId: "vb", title: "B项目作品", createTime: 1780000000 }],
      viralVideos: [{ title: "B项目爆款", videoUrl: "https://b/v1", likes: 9999, engagementScore: 9999 }],
      lastRefreshedAt: now,
      refreshStatus: "success",
    },
    {
      id: "wa-null",
      userId: "user-1",
      projectId: null,
      nickname: "历史空项目账号",
      platform: "douyin",
      targetUrl: "https://c",
      latestVideos: [{ videoId: "vc", title: "历史作品", createTime: 1780000000 }],
      viralVideos: [{ title: "历史爆款", videoUrl: "https://c/v1", likes: 500, engagementScore: 500 }],
      lastRefreshedAt: now,
      refreshStatus: "success",
    },
  ])
  const videoCopies = makeTable([
    {
      id: "vc-a",
      userId: "user-1",
      projectId: "project-a",
      videoTitle: "A项目标题",
      sourceUrl: "https://www.douyin.com/video/va",
      transcript: "A项目原文",
      analysisResult: { markdown: "A项目拆解" },
    },
    {
      id: "vc-b",
      userId: "user-1",
      projectId: "project-b",
      videoTitle: "B项目标题",
      sourceUrl: "https://www.douyin.com/video/vb",
      transcript: "B项目原文",
      analysisResult: { markdown: "B项目拆解" },
    },
  ])
  const competitorAnalyses = makeTable([
    // project-b row intentionally first: a userId-only query picks its (newer)
    // top video first, exposing the cross-project leak through the prompt.
    {
      id: "ca-b",
      userId: "user-1",
      projectId: "project-b",
      status: "completed",
      platform: "douyin",
      completedAt: now,
      rawVideoData: [{ videoId: "item-b", likes: 9999 }],
    },
    {
      id: "ca-a",
      userId: "user-1",
      projectId: "project-a",
      status: "completed",
      platform: "douyin",
      completedAt: now,
      rawVideoData: [{ videoId: "item-a", likes: 100 }],
    },
  ])
  return {
    prisma: {
      watchAccount: watchAccounts,
      videoCopyExtraction: videoCopies,
      competitorAnalysis: competitorAnalyses,
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: DB.prisma }))

const { hasCommentApi, fetchRedFoxComments } = vi.hoisted(() => ({
  hasCommentApi: vi.fn(() => true),
  fetchRedFoxComments: vi.fn(async ({ itemId }: { itemId: string }) => ({
    items:
      itemId === "item-a"
        ? [{ text: "A项目热评", likes: 50, isTop: false, nickname: "" }]
        : [{ text: "B项目热评", likes: 50, isTop: false, nickname: "" }],
  })),
}))
vi.mock("@/lib/redfox/comments", () => ({ hasCommentApi, fetchRedFoxComments }))

// ─── chat context loader dependencies (kept inert; the competitor context
// builder itself stays real so the loader test exercises real query scoping).
// ───
vi.mock("@/lib/aim-knowledge-context", () => ({
  buildAimKnowledgeContext: vi.fn(async () => ({ knowledgeBlock: "", entries: [], source: "raw" })),
}))
vi.mock("@/lib/aim-pain-intent", () => ({
  enrichKnowledgeQueryWithPainIntent: vi.fn((query: string) => query),
  mergePainIntentIntoKnowledgeContext: vi.fn((input: Record<string, unknown>) => ({
    knowledgeBlock: input.knowledgeBlock,
    entries: input.entries,
    source: input.source,
  })),
  resolvePainPointIntent: vi.fn(async () => null),
}))
vi.mock("@/lib/aim-knowledge-strategy", () => ({
  shouldUseKnowledgeContextForTask: vi.fn(() => false),
  shouldUseMarketViralContextForTask: vi.fn(() => true),
}))
vi.mock("@/lib/style-profile", () => ({ getStyleProfileBlock: vi.fn(async () => "") }))
vi.mock("@/lib/aim-editor", () => ({ formatEditorContextForPrompt: vi.fn(() => "") }))
vi.mock("@/lib/aim-observability", () => ({
  runAimTraceStep: vi.fn(async (_trace: unknown, _key: string, _label: string, loader: () => unknown) =>
    loader()),
}))
vi.mock("@/lib/aim-memory", () => ({
  retrieveAimMemory: vi.fn(async () => []),
  retrieveLayeredAimMemory: vi.fn(async () => []),
  formatAimMemoryBlock: vi.fn(() => ""),
}))
vi.mock("@/lib/aim-context-priority", () => ({
  composeAimReferenceContext: vi.fn((input: Record<string, string>) =>
    [input.projectKnowledge, input.styleBlock, input.memoryBlock, input.externalReference]
      .filter(Boolean)
      .join("\n")),
}))
vi.mock("@/lib/methodology-profile-store", () => ({
  resolveMethodologyPolicy: vi.fn(async () => ({ source: "none", selections: [], versionRows: [] })),
  buildMethodologyProfileBlock: vi.fn(() => ""),
}))
vi.mock("@/lib/aim/content-outcome-context", () => ({
  resolvePublishOutcomeBlock: vi.fn(async () => undefined),
}))

import {
  buildRawInputWithMarketViralContext,
  buildRawInputWithVideoCopyContext,
  buildRawInputWithCommentInsightContext,
} from "@/lib/aim-generate-context"
import { buildAimCompetitorWatchContext } from "@/lib/aim-competitor-watch-context"
import { buildWatchAccountDigest } from "@/lib/hot-briefing-watch-context"
import { retrieveChatContextBlocks } from "@/lib/aim/services/chat/context-loaders"

const BOUND = "project-a"
const FOREIGN = "project-b"

describe("buildRawInputWithMarketViralContext — bound project only", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("includes viral videos of bound-project accounts", async () => {
    const out = await buildRawInputWithMarketViralContext("user-1", "帮我做定位", true, BOUND)
    expect(out).toContain("A项目爆款")
  })

  it("never includes viral videos of project-b or null-project accounts", async () => {
    const out = await buildRawInputWithMarketViralContext("user-1", "帮我做定位", true, BOUND)
    expect(out).not.toContain("B项目爆款")
    expect(out).not.toContain("历史爆款")
  })

  it("queries with userId + projectId", async () => {
    await buildRawInputWithMarketViralContext("user-1", "帮我做定位", true, BOUND)
    const call = DB.prisma.watchAccount.findMany.mock.calls[0][0] as { where: Record<string, unknown> }
    expect(call.where).toMatchObject({ userId: "user-1", projectId: BOUND })
  })
})

describe("buildRawInputWithVideoCopyContext — bound project only", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("appends context for a bound-project extraction", async () => {
    const out = await buildRawInputWithVideoCopyContext("user-1", "改成我的文案", "vc-a", BOUND)
    expect(out).toContain("A项目拆解")
  })

  it("refuses a same-user extraction from project-b (empty context, no leak)", async () => {
    const out = await buildRawInputWithVideoCopyContext("user-1", "改成我的文案", "vc-b", BOUND)
    expect(out).toBe("改成我的文案")
    expect(out).not.toContain("B项目拆解")
  })
})

describe("buildRawInputWithCommentInsightContext — bound project only", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    hasCommentApi.mockReturnValue(true)
    fetchRedFoxComments.mockImplementation(async ({ itemId }: { itemId: string }) => ({
      items:
        itemId === "item-a"
          ? [{ text: "A项目热评", likes: 50, isTop: false, nickname: "" }]
          : [{ text: "B项目热评", likes: 50, isTop: false, nickname: "" }],
    }))
  })

  it("picks the top video only from bound-project analyses", async () => {
    const out = await buildRawInputWithCommentInsightContext("user-1", "帮我分析对标账号评论", true, BOUND)
    expect(out).toContain("A项目热评")
    expect(out).not.toContain("B项目热评")
  })
})

describe("buildAimCompetitorWatchContext — bound project only", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("returns recent works of bound-project accounts only", async () => {
    const out = await buildAimCompetitorWatchContext("user-1", "对标账号最近发了什么", BOUND)
    expect(out).toContain("对标A")
    expect(out).not.toContain("B项目账号")
    expect(out).not.toContain("历史空项目账号")
  })
})

describe("buildWatchAccountDigest (hot briefing) — bound project only", () => {
  it("digests only bound-project accounts", async () => {
    const out = await buildWatchAccountDigest("user-1", BOUND)
    expect(out).toContain("对标A")
    expect(out).not.toContain("B项目账号")
    expect(out).not.toContain("历史空项目账号")
  })
})

describe("chat context loaders — competitor context uses the bound project", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("retrieveChatContextBlocks injects only bound-project watched-account context", async () => {
    const blocks = await retrieveChatContextBlocks({
      userId: "user-1",
      projectId: BOUND,
      agentId: "business_diagnosis",
      query: "帮我看一下对标账号最近的作品",
      conversationIntent: {
        mode: "chat",
        confidence: 1,
        reason: "test",
        targetSummary: "",
        useKnowledge: true,
        useMethodology: false,
        useStyleProfile: false,
        useLongTermMemory: false,
      },
      runtimeTask: "quality_review",
    })
    expect(blocks.competitorWatchBlock).toContain("对标A")
    expect(blocks.competitorWatchBlock).not.toContain("B项目账号")
    expect(blocks.competitorWatchBlock).not.toContain("历史空项目账号")
  })
})
