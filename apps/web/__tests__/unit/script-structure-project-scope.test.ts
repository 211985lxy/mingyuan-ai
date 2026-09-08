import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

/**
 * Finding A regression tests — extracted VideoStructure rows must be scoped to
 * the caller's BOUND project everywhere a structure can enter a generation
 * context (generation blueprint lookup + script-structure-store reads).
 *
 * Canonical rows (origin="canonical") are public, owner-less templates and stay
 * selectable even though their projectId column is null. Extracted rows
 * (origin="extracted", user-owned) with projectId = null are legacy rows that
 * must NEVER be resolved as a generation structure for a bound account.
 *
 * The prisma double enforces `where` clauses against seeded rows, so a leaky
 * query (one that still allows `{ projectId: null }`) returns the legacy row
 * and the assertions fail — a genuine RED.
 */

// ---------------------------------------------------------------------------
// Minimal in-memory prisma double (same semantics as the one used by
// legacy-content-project-isolation.test.ts).
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
      blueprint: { segments: [] },
      sortOrder: 1000,
      status: "published",
      sourceScriptText: "来源",
      sourceScriptsCount: 1,
      createdAt: now(),
      updatedAt: now(),
    }
    const prisma: Record<string, unknown> = {
      videoStructure: makeTable([
        // 绑定项目内的提取结构：可被读取/作为生成蓝图
        { id: "vs-a", name: "bound-extracted", displayName: "项目A提取结构", origin: "extracted", userId: "user-1", projectId: "project-a", ...structureBase },
        // 历史遗留空项目提取结构：绑定项目上下文下不得进入生成
        { id: "vs-null", name: "legacy-null", displayName: "历史空项目提取结构", origin: "extracted", userId: "user-1", projectId: null, ...structureBase },
        // 另一项目的提取结构：绑定项目上下文下也不得进入生成
        { id: "vs-b", name: "other-extracted", displayName: "B项目提取结构", origin: "extracted", userId: "user-1", projectId: "project-b", ...structureBase },
        // canonical 公开模板：project-less 是合法的
        { id: "vs-canon", name: "canonical-1", displayName: "公开模板", origin: "canonical", userId: null, projectId: null, ...structureBase },
      ]),
      contentTemplate: makeTable([
        { id: "tmpl-1", displayName: "模板", description: "d", scriptTemplate: "s", hookType: "h", variables: [], expressionBlueprint: null, status: "published" },
      ]),
      ipProfile: makeTable([]),
      user: makeTable([
        { id: "user-1", email: "u@test.com", boundProjectId: "project-a" },
      ]),
    }
    return prisma as {
      videoStructure: ReturnType<typeof makeTable>
      contentTemplate: ReturnType<typeof makeTable>
      ipProfile: ReturnType<typeof makeTable>
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
        ;(this.prisma as Record<string, unknown>)[key] = (fresh as Record<string, unknown>)[key]
      }
    },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: DB.prisma }))

// Route handlers wrap their inner handler with withUserAuth; pass straight through.
vi.mock("@/lib/user-auth", () => ({
  withUserAuth: (handler: (request: unknown, context: { user: { id: string } }) => unknown) =>
    handler,
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

import { getStructure, listExtractedStructures } from "@/lib/aim/script-structure-store"
import { POST as generateScript } from "@/app/api/scripts/generate/route"

const BOUND = "project-a"

beforeEach(() => {
  DB.reset()
})

function ctx() {
  return { user: { id: "user-1", email: "u@test.com" }, params: Promise.resolve({}) }
}

// ---------------------------------------------------------------------------
// Store-level reads (script-structure-store).
// ---------------------------------------------------------------------------

describe("script-structure-store — extracted structures require the bound project", () => {
  it("getStructure returns a bound-project extracted structure", async () => {
    const record = await getStructure("vs-a", "user-1", BOUND)
    expect(record?.id).toBe("vs-a")
  })

  it("getStructure does NOT return a legacy null-project extracted structure to a bound caller", async () => {
    const record = await getStructure("vs-null", "user-1", BOUND)
    expect(record).toBeNull()
  })

  it("getStructure does NOT return another project's extracted structure", async () => {
    const record = await getStructure("vs-b", "user-1", BOUND)
    expect(record).toBeNull()
  })

  it("getStructure still returns canonical structures (public, legitimately project-less)", async () => {
    const record = await getStructure("vs-canon", "user-1", BOUND)
    expect(record?.id).toBe("vs-canon")
  })

  it("listExtractedStructures excludes legacy null-project rows for a bound project", async () => {
    const rows = await listExtractedStructures("user-1", BOUND, 50)
    const ids = rows.map((r) => r.id)
    expect(ids).not.toContain("vs-null")
    expect(ids).not.toContain("vs-b")
    expect(ids).toContain("vs-a")
  })
})

// ---------------------------------------------------------------------------
// Generation blueprint lookup (apps/web/src/app/api/scripts/generate/route.ts)
// ---------------------------------------------------------------------------

async function generateWithStructure(structureId: string) {
  return generateScript(
    new NextRequest("http://localhost/api/scripts/generate", {
      method: "POST",
      body: JSON.stringify({
        templateId: "tmpl-1",
        structureId,
        inputs: { topic: "测试" },
      }),
      headers: { "Content-Type": "application/json" },
    }),
    { ...ctx(), params: Promise.resolve({}) },
  )
}

describe("scripts/generate — generation blueprint selection", () => {
  it("selects a bound-project extracted structure as the generation blueprint", async () => {
    const res = await generateWithStructure("vs-a")
    // ipProfile is empty in this double, so a *found* structure proceeds to the
    // ipProfile gate (412) instead of the not-found error (400).
    expect(res.status).toBe(412)
  })

  it("does NOT select a legacy null-project extracted structure as the generation blueprint", async () => {
    const res = await generateWithStructure("vs-null")
    expect(res.status).toBe(400) // Video structure not found
  })

  it("does NOT select another project's extracted structure", async () => {
    const res = await generateWithStructure("vs-b")
    expect(res.status).toBe(400)
  })

  it("still selects canonical (public template) structures", async () => {
    const res = await generateWithStructure("vs-canon")
    expect(res.status).toBe(412)
  })
})
