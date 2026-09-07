import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Task 4 — account-project isolation regression tests.
 *
 * Every read/list/detail/delete of the five legacy account-level data types
 * (video copy extractions, watched competitor accounts, competitor analyses,
 * content generation runs, scripts) must be scoped to the caller's BOUND
 * project (`userId + projectId`). Records seeded in `project-b` or with
 * `projectId = null` for the SAME user must be invisible.
 *
 * The prisma mock below is a tiny in-memory table that actually enforces the
 * `where` clauses, so a leaky query (only `userId`) returns foreign rows and
 * the assertions fail — a genuine RED, not mock self-consistency.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory prisma double, reseeded before every test (tests that
// delete rows must not leak state into later tests).
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
    let rows = seed.map((r) => ({ ...r }))
    const clone = () => rows.map((r) => ({ ...r }))
    return {
      findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        clone().find((r) => matchesWhere(r, where)) ?? null),
      findMany: vi.fn(async ({ where, take }: { where: Record<string, unknown>; take?: number }) => {
        let out = clone().filter((r) => matchesWhere(r, where))
        if (take !== undefined) out = out.slice(0, take)
        return out
      }),
      count: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        clone().filter((r) => matchesWhere(r, where)).length),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        const row = { id: `created-${Math.random().toString(36).slice(2, 8)}`, ...data }
        rows.push(row)
        return { ...row }
      }),
      findUnique: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
        clone().find((r) => matchesWhere(r, where)) ?? null),
      update: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const idx = rows.findIndex((r) => matchesWhere(r, where))
        if (idx === -1) return null
        rows[idx] = { ...rows[idx], ...data }
        return { ...rows[idx] }
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        let count = 0
        rows = rows.map((r) => {
          if (!matchesWhere(r, where)) return r
          count += 1
          return { ...r, ...data }
        })
        return { count }
      }),
      deleteMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const before = rows.length
        rows = rows.filter((r) => !matchesWhere(r, where))
        return { count: before - rows.length }
      }),
      delete: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        const idx = rows.findIndex((r) => matchesWhere(r, where))
        if (idx === -1) throw new Error("P2025")
        const [removed] = rows.splice(idx, 1)
        return removed
      }),
    }
  }

  const now = () => new Date("2026-09-01T00:00:00.000Z")
  const baseVideoCopy = {
    sourceUrl: "https://www.douyin.com/video/1",
    platform: "douyin",
    provider: "tikhub",
    status: "completed",
    errorMessage: null,
    analysisError: null,
    videoTitle: "标题",
    videoCover: null,
    videoDuration: null,
    transcript: "口播",
    analysisResult: null,
    createdAt: now(),
    updatedAt: now(),
    completedAt: now(),
  }
  const baseAnalysis = {
    platform: "douyin",
    targetUrl: "https://www.douyin.com/user/u",
    status: "completed",
    accountName: "账号",
    accountAvatar: null,
    followerCount: 1,
    overallScore: 1,
    collectionSource: null,
    fallbackUsed: false,
    fallbackReason: null,
    createdAt: now(),
    completedAt: now(),
    errorMessage: null,
  }

  function build() {
    const prisma: Record<string, unknown> = {
      videoCopyExtraction: makeTable([
        { id: "vc-a", userId: "user-1", projectId: "project-a", ...baseVideoCopy },
        { id: "vc-b", userId: "user-1", projectId: "project-b", ...baseVideoCopy, videoTitle: "B项目文案" },
        { id: "vc-null", userId: "user-1", projectId: null, ...baseVideoCopy, videoTitle: "历史空项目文案" },
      ]),
      watchAccount: makeTable([
        { id: "wa-a", userId: "user-1", projectId: "project-a", targetUrl: "https://a", platform: "douyin", platformUserId: "ua", nickname: "对标A" },
        { id: "wa-b", userId: "user-1", projectId: "project-b", targetUrl: "https://b", platform: "douyin", platformUserId: "ub", nickname: "B项目账号" },
        { id: "wa-null", userId: "user-1", projectId: null, targetUrl: "https://c", platform: "douyin", platformUserId: "uc", nickname: "历史空项目账号" },
      ]),
      competitorAnalysis: makeTable([
        { id: "ca-a", userId: "user-1", projectId: "project-a", ...baseAnalysis },
        { id: "ca-b", userId: "user-1", projectId: "project-b", ...baseAnalysis, accountName: "B项目分析" },
        { id: "ca-null", userId: "user-1", projectId: null, ...baseAnalysis, accountName: "历史空项目分析" },
      ]),
      clientProject: makeTable([
        { id: "project-a", userId: "user-1", status: "active", name: "项目A", companyName: null, industry: null, targetCustomer: null, offer: null, deliveryGoal: null, notes: null },
      ]),
      user: makeTable([
        { id: "user-1", email: "u@test.com", boundProjectId: "project-a" },
      ]),
    }
    return prisma as {
      videoCopyExtraction: ReturnType<typeof makeTable>
      watchAccount: ReturnType<typeof makeTable>
      competitorAnalysis: ReturnType<typeof makeTable>
      clientProject: ReturnType<typeof makeTable>
      user: ReturnType<typeof makeTable>
      $transaction?: unknown
    }
  }

  const prisma = build()
  return {
    prisma: { ...prisma, $transaction: vi.fn() },
    reset() {
      const fresh = build()
      for (const key of Object.keys(fresh)) {
        // Delegate objects are swapped in place; route/lib modules look up
        // `prisma.<model>` dynamically on each call.
        ;(this.prisma as Record<string, unknown>)[key] = (fresh as Record<string, unknown>)[key]
      }
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: DB.prisma }))

// Route handlers wrap their inner handler with withUserAuth; pass straight through.
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (request: unknown, context: { user: { id: string }; params?: Record<string, string> }) => unknown) =>
    async (request: unknown, segmentData: { user: { id: string }; params?: Promise<Record<string, string>> }) =>
      handler(request, {
        ...segmentData,
        params: segmentData.params ? await segmentData.params : undefined,
      }),
}))

// Server-authoritative binding resolver for route tests.
vi.mock("@/lib/account-project-context", () => ({
  resolveBoundProject: vi.fn(async () => ({ id: "project-a", name: "项目A", status: "active" })),
  isAccountProjectContextError: (error: unknown) =>
    error instanceof AccountProjectContextErrorMock,
}))

class AccountProjectContextErrorMock extends Error {
  code = "PROJECT_CONTEXT_MISMATCH"
  status = 409
}

import { getVideoCopyExtractionForUser } from "@/lib/video-copy-extractions"
import { createWatchVideoExtraction } from "@/lib/competitor-watch-video-extractions"
import { checkCompetitorMatch } from "@/lib/content-pipeline/competitor-bridge"
import { saveGeneratedScripts } from "@/lib/aim/script-structure-store"
import { GET as listVideoCopies } from "@/app/api/video-copy-extractions/route"
import { GET as listWatchAccounts } from "@/app/api/competitor/watch-accounts/route"
import { DELETE as deleteWatchAccount } from "@/app/api/competitor/watch-accounts/[id]/route"
import { GET as listCompetitorReports } from "@/app/api/competitor/reports/route"
import { GET as getCompetitorAnalysis } from "@/app/api/competitor/[id]/route"

const BOUND = "project-a"

beforeEach(() => {
  DB.reset()
})

function ctx() {
  return { user: { id: "user-1", email: "u@test.com" }, params: Promise.resolve<Record<string, string>>({}) }
}
function ctxWithParams(params: Record<string, string>) {
  return { ...ctx(), params: Promise.resolve(params) }
}
function makeRequest(url: string, init?: ConstructorParameters<typeof NextRequest>[1]) {
  return new NextRequest(url, init)
}

describe("video copy extractions — detail read scoped to bound project", () => {
  it("returns a record that belongs to the bound project", async () => {
    const record = await getVideoCopyExtractionForUser("user-1", "vc-a", BOUND)
    expect(record?.id).toBe("vc-a")
  })

  it("does NOT return a same-user record under project-b", async () => {
    const record = await getVideoCopyExtractionForUser("user-1", "vc-b", BOUND)
    expect(record).toBeNull()
  })

  it("does NOT return a same-user record with projectId null", async () => {
    const record = await getVideoCopyExtractionForUser("user-1", "vc-null", BOUND)
    expect(record).toBeNull()
  })
})

describe("video copy extractions — list route scoped to bound project", () => {
  it("lists only bound-project records", async () => {
    const response = await listVideoCopies(makeRequest("http://localhost/api/video-copy-extractions"), ctx())
    expect(response.status).toBe(200)
    const body = await response.json()
    const titles = (body.items as Array<{ videoTitle: string | null }>).map((i) => i.videoTitle)
    expect(titles).not.toContain("B项目文案")
    expect(titles).not.toContain("历史空项目文案")
    expect(titles.length).toBe(1)
  })
})

describe("watched competitor accounts", () => {
  it("list route returns only bound-project accounts", async () => {
    const response = await listWatchAccounts(makeRequest("http://localhost/api/competitor/watch-accounts"), ctx())
    expect(response.status).toBe(200)
    const body = await response.json()
    const nicknames = (body.items as Array<{ nickname: string | null }>).map((i) => i.nickname)
    expect(nicknames).not.toContain("B项目账号")
    expect(nicknames).not.toContain("历史空项目账号")
  })

  it("createWatchVideoExtraction only accepts accounts inside the bound project", async () => {
    const db = {
      watchAccount: {
        findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) =>
          where.id === "wa-a" ? { id: "wa-a", userId: "user-1", projectId: "project-a" } : null),
      },
      videoCopyExtraction: { findFirst: vi.fn(async () => null) },
    }
    const createExtraction = vi.fn(async () => ({ id: "new-extraction", userId: "user-1", projectId: BOUND }))

    await expect(
      createWatchVideoExtraction({
        userId: "user-1",
        watchAccountId: "wa-b", // belongs to project-b → the bound-project query finds nothing
        videoUrl: "https://www.douyin.com/video/2",
        projectId: BOUND,
        db: db as never,
        createExtraction: createExtraction as never,
      }),
    ).rejects.toThrow("对标账号不存在或无权限")

    expect(createExtraction).not.toHaveBeenCalled()
    const where = (db.watchAccount.findFirst.mock.calls[0][0] as { where: Record<string, unknown> }).where
    expect(where).toMatchObject({ id: "wa-b", userId: "user-1", projectId: BOUND })
  })

  it("delete route 404s a same-user account from project-b", async () => {
    const response = await deleteWatchAccount(
      makeRequest("http://localhost/api/competitor/watch-accounts/wa-b"),
      ctxWithParams({ id: "wa-b" }),
    )
    expect(response.status).toBe(404)
  })

  it("delete route removes a same-user account from the bound project", async () => {
    const response = await deleteWatchAccount(
      makeRequest("http://localhost/api/competitor/watch-accounts/wa-a"),
      ctxWithParams({ id: "wa-a" }),
    )
    expect(response.status).toBe(200)
  })
})

describe("competitor analyses — list + detail scoped to bound project", () => {
  it("list route returns only bound-project analyses", async () => {
    const response = await listCompetitorReports(makeRequest("http://localhost/api/competitor/reports"), ctx())
    expect(response.status).toBe(200)
    const body = await response.json()
    const names = (body.items as Array<{ accountName: string | null }>).map((i) => i.accountName)
    expect(names).not.toContain("B项目分析")
    expect(names).not.toContain("历史空项目分析")
    expect((body as { total: number }).total).toBe(1)
  })

  it("detail route returns 404 for a same-user analysis from project-b", async () => {
    const response = await getCompetitorAnalysis(
      makeRequest("http://localhost/api/competitor/ca-b"),
      ctxWithParams({ id: "ca-b" }),
    )
    expect(response.status).toBe(404)
  })

  it("detail route returns the bound-project analysis", async () => {
    const response = await getCompetitorAnalysis(
      makeRequest("http://localhost/api/competitor/ca-a"),
      ctxWithParams({ id: "ca-a" }),
    )
    expect(response.status).toBe(200)
  })
})

describe("content pipeline competitor bridge — watched-account match scoped to bound project", () => {
  it("matches an author only when their watched account is inside the bound project", async () => {
    const match = await checkCompetitorMatch({
      authorName: "对标A",
      platform: "douyin",
      userId: "user-1",
      projectId: BOUND,
    })
    expect(match.isCompetitor).toBe(true)
    expect(match.watchAccountId).toBe("wa-a")
  })

  it("never matches a watched account from project-b for the same user", async () => {
    const match = await checkCompetitorMatch({
      authorName: "B项目账号",
      platform: "douyin",
      userId: "user-1",
      projectId: BOUND,
    })
    expect(match.isCompetitor).toBe(false)
  })
})

describe("script + content generation run writes are stamped with the bound project", () => {
  it("saveGeneratedScripts stores projectId on every Script row", async () => {
    const txScriptCreate = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: "script-1",
      ...data,
    }))
    const tx = { script: { create: txScriptCreate } }
    ;(DB.prisma.$transaction as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (cb: (t: typeof tx) => Promise<unknown>) => cb(tx),
    )

    await saveGeneratedScripts({
      scripts: [{ title: "t", content: "content", segmentOrder: ["0"] }],
      userId: "user-1",
      structureId: "vs-1",
      projectId: BOUND,
    })

    const data = txScriptCreate.mock.calls[0][0] as { data: Record<string, unknown> }
    expect(data.data.projectId).toBe(BOUND)
  })
})
