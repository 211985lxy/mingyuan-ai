import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Finding — hot-topics fit route must NOT feed an unowned / null-project
 * extracted VideoStructure blueprint to the fit model.
 *
 * POST /api/hot-topics/[id]/fit selects a `videoStructure` by id/name and feeds
 * its blueprint into `evaluateHotTopicFit` (a model call). A client must only be
 * able to reference a structure it owns AND that belongs to its bound project
 * (canonical public templates excepted) — exactly like scripts/generate.
 *
 * The prisma double enforces `where` clauses against seeded rows, so a leaky
 * lookup (no origin/user/project constraint) returns the legacy/foreign row and
 * the assertions fail — a genuine RED.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory prisma double (same semantics as the one used by
// legacy-content-project-isolation.test.ts / script-structure-project-scope.test.ts).
// ---------------------------------------------------------------------------
const DB = vi.hoisted(() => {
  type Row = Record<string, unknown> & { id: string }

  function matchesWhere(row: Row, where: Record<string, unknown> | undefined): boolean {
    if (!where) return true
    for (const [key, condition] of Object.entries(where)) {
      if (key === "AND" && Array.isArray(condition)) {
        if (!(condition as Record<string, unknown>[]).every((w) => matchesWhere(row, w))) return false
        continue
      }
      if (key === "OR" && Array.isArray(condition)) {
        if (!(condition as Record<string, unknown>[]).some((w) => matchesWhere(row, w))) return false
        continue
      }
      if (condition && typeof condition === "object" && !(condition as Row).id) {
        const op = condition as Record<string, unknown>
        if ("in" in op && Array.isArray(op.in)) {
          if (!(op.in as unknown[]).includes(row[key])) return false
          continue
        }
        continue
      }
      if (row[key] !== condition) return false
    }
    return true
  }

  function makeTable(seed: Row[]) {
    const rows = seed.map((r) => ({ ...r }))
    const clone = () => rows.map((r) => ({ ...r }))
    return {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        clone().find((r) => matchesWhere(r, where)) ?? null),
      findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        let out = clone().filter((r) => matchesWhere(r, where))
        if (take !== undefined) out = out.slice(0, take)
        return out
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        clone().find((r) => matchesWhere(r, where)) ?? null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `created-${Math.random().toString(36).slice(2, 8)}`, ...data }
        rows.push(row)
        return { ...row }
      }),
    }
  }

  const now = () => new Date("2026-09-01T00:00:00.000Z")

  function build() {
    const structureBase = {
      subtitle: null,
      description: "结构",
      useCase: "extracted",
      blueprint: {
        openingPattern: "反差开场",
        narrativeBeats: ["冲突"],
        evidenceSlots: 1,
        ctaSlot: "咨询",
        durationRange: { min: 30, max: 60 },
      },
      sortOrder: 1000,
      status: "published",
      sourceScriptText: "来源",
      sourceScriptsCount: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    const prisma: Record<string, unknown> = {
      videoStructure: makeTable([
        // 绑定项目内的提取结构：当前用户可引用（fit 模型上下文合法来源）
        { id: "vs-a", name: "bound-extracted", displayName: "项目A提取结构", origin: "extracted", userId: "user-1", projectId: "project-a", ...structureBase },
        // 历史遗留空项目提取结构：绑定项目上下文下不得喂给 fit 模型
        { id: "vs-null", name: "legacy-null", displayName: "历史空项目提取结构", origin: "extracted", userId: "user-1", projectId: null, ...structureBase },
        // 另一用户的提取结构：当前用户不得引用
        { id: "vs-other", name: "other-user-extracted", displayName: "他人提取结构", origin: "extracted", userId: "user-2", projectId: "project-a", ...structureBase },
        // 同用户另一项目的提取结构：绑定项目上下文下不得引用
        { id: "vs-b", name: "other-project-extracted", displayName: "B项目提取结构", origin: "extracted", userId: "user-1", projectId: "project-b", ...structureBase },
        // canonical 公开模板：project-less 是合法的，仍可引用
        { id: "vs-canon", name: "canonical-1", displayName: "公开模板", origin: "canonical", userId: null, projectId: null, ...structureBase },
      ]),
      contentTemplate: makeTable([
        { id: "tmpl-1", displayName: "模板", description: "d", hookType: "h", scriptTemplate: "s", expressionBlueprint: null, status: "published" },
      ]),
    }
    return prisma as {
      videoStructure: ReturnType<typeof makeTable>
      contentTemplate: ReturnType<typeof makeTable>
    }
  }

  const prisma = build()
  return {
    prisma: { ...prisma },
    reset() {
      const fresh = build()
      for (const key of Object.keys(fresh)) {
        ;(this.prisma as Record<string, unknown>)[key] = (fresh as Record<string, unknown>)[key]
      }
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: DB.prisma }))

// Route handlers wrap their inner handler with withUserAuth; pass straight through.
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (request: unknown, context: { user: { id: string }; params?: Record<string, string> }) => unknown) =>
    // 与生产包装器对齐：解包 segmentData.params 后再交给 handler
    async (request: unknown, segmentData?: { params: Promise<Record<string, string>> }) =>
      handler(request, { user: { id: "user-1" }, params: await segmentData?.params }),
}))

vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject: vi.fn(async () => ({ id: "project-a", name: "项目A", status: "active" })),
  AccountProjectContextError: class AccountProjectContextError extends Error {
    code = "PROJECT_CONTEXT_MISMATCH"
    status = 409
  },
  isAccountProjectContextError: (error: unknown) =>
    error instanceof (class AccountProjectContextError extends Error {}),
}))

// hot-topic-intelligence: don't hit the real LLM / insight pipeline in this unit test.
const { evaluateHotTopicFit, getOrGenerateHotTopicInsight } = vi.hoisted(() => ({
  evaluateHotTopicFit: vi.fn(async () => ({
    score: 80,
    verdict: "strong",
    fitSummary: "契合",
    bridgeReason: "热点与项目主题相关",
    recommendedAngle: "x",
    recommendedHook: "y",
    ctaDirection: "z",
    caution: "",
  })),
  getOrGenerateHotTopicInsight: vi.fn(async () => ({
    topic: { id: "topic-1", sentenceId: "topic-1", word: "热点", title: "测试热点" },
    insight: {
      summary: "摘要",
      whyTrending: "为什么火",
      marketingThemes: [],
      riskLevel: "low",
      caution: [],
      notRecommendedAngles: [],
      topicId: "topic-1",
    },
  })),
}))

vi.mock("@/lib/hot-topic-intelligence", () => ({
  evaluateHotTopicFit,
  getOrGenerateHotTopicInsight,
  HotTopicIntelligenceError: class HotTopicIntelligenceError extends Error {
    code = "HOT_TOPIC_FIT_UNAVAILABLE"
    status = 503
  },
}))

import { POST as fitTopic } from "@/app/api/hot-topics/[id]/fit/route"

beforeEach(() => {
  DB.reset()
  vi.clearAllMocks()
  evaluateHotTopicFit.mockResolvedValue({
    score: 80,
    verdict: "strong",
    fitSummary: "契合",
    bridgeReason: "热点与项目主题相关",
    recommendedAngle: "x",
    recommendedHook: "y",
    ctaDirection: "z",
    caution: "",
  })
  getOrGenerateHotTopicInsight.mockResolvedValue({
    topic: { id: "topic-1", sentenceId: "topic-1", word: "热点", title: "测试热点" },
    insight: {
      summary: "摘要",
      whyTrending: "为什么火",
      marketingThemes: [],
      riskLevel: "low",
      caution: [],
      notRecommendedAngles: [],
      topicId: "topic-1",
    },
  })
})

function ctx() {
  return { user: { id: "user-1", email: "u@test.com" }, params: { id: "topic-1" } }
}

async function fitWithStructure(structureId: string) {
  const request = new NextRequest("http://localhost/api/hot-topics/topic-1/fit", {
    method: "POST",
    body: JSON.stringify({
      templateId: "tmpl-1",
      structureId,
      inputs: { topic: "测试" },
    }),
    headers: { "Content-Type": "application/json" },
  })
  return fitTopic(request, { ...ctx(), params: Promise.resolve({ id: "topic-1" }) })
}

describe("hot-topics fit — structure blueprint must belong to the bound project", () => {
  it("selects a bound-project extracted structure owned by the user", async () => {
    const res = await fitWithStructure("vs-a")
    expect(res.status).toBe(200)
    expect(evaluateHotTopicFit).toHaveBeenCalledTimes(1)
  })

  it("selects a canonical (public, project-less) structure", async () => {
    const res = await fitWithStructure("vs-canon")
    expect(res.status).toBe(200)
    expect(evaluateHotTopicFit).toHaveBeenCalledTimes(1)
  })

  it("does NOT select a legacy null-project extracted structure", async () => {
    const res = await fitWithStructure("vs-null")
    expect(res.status).toBe(400) // Video structure not found
    expect(evaluateHotTopicFit).not.toHaveBeenCalled()
  })

  it("does NOT select another user's extracted structure", async () => {
    const res = await fitWithStructure("vs-other")
    expect(res.status).toBe(400)
    expect(evaluateHotTopicFit).not.toHaveBeenCalled()
  })

  it("does NOT select a same-user extracted structure from another project", async () => {
    const res = await fitWithStructure("vs-b")
    expect(res.status).toBe(400)
    expect(evaluateHotTopicFit).not.toHaveBeenCalled()
  })
})
