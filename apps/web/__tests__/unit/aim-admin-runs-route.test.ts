/**
 * Admin run diagnostics route — auth + runId lookup contract.
 *
 * Verifies the route requires admin auth, returns the joined trace+snapshot by
 * runId, marks expired snapshots, and 404s for unknown runIds. Prisma and the
 * admin auth wrapper are mocked so this is DB-free and fast.
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"

// Mock prisma with in-memory trace/snapshot stores.
const traceStore = new Map<string, Record<string, unknown>>()
const snapshotStore = new Map<string, Record<string, unknown>>()
const aimExecutionTrace = {
  // runId is non-unique on the trace → route uses findFirst
  findFirst: vi.fn(async ({ where }: { where: { runId?: string; id?: string } }) =>
    where.runId ? traceStore.get(where.runId) ?? null : null
  ),
  findMany: vi.fn(async (_args: unknown) => Array.from(traceStore.values())),
  count: vi.fn(async (_args: unknown) => traceStore.size),
}
const aimRunSnapshot = {
  findUnique: vi.fn(async ({ where }: { where: { runId?: string } }) =>
    where.runId ? snapshotStore.get(where.runId) ?? null : null
  ),
}
vi.mock("@/lib/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_t, prop) => {
        if (prop === "aimExecutionTrace") return aimExecutionTrace
        if (prop === "aimRunSnapshot") return aimRunSnapshot
        return undefined
      },
    }
  ),
}))

// Admin auth: pass through ctx (params) so the route can read runId.
vi.mock("@/lib/admin-auth", () => ({
  withAdminOrEditor: (handler: any) => handler,
  withAdminOnly: (handler: (req: unknown, ctx: { admin?: { id: string }; params?: Record<string, string> }) => unknown) =>
    async (req: unknown, segmentData: { params: Promise<Record<string, string>> }) =>
      handler(req, {
        admin: { id: "admin-1" },
        params: segmentData ? await segmentData.params : undefined,
      }),
}))

vi.mock("@/lib/admin-audit", () => ({
  recordAdminAudit: vi.fn(async () => "req-audit-1"),
}))

import { GET as getRun } from "@/app/api/admin/aim/runs/[runId]/route"
import { GET as listRuns } from "@/app/api/admin/aim/runs/route"

function runRequest(url: string) {
  return new NextRequest(url, { method: "GET" })
}

function segment(params: Record<string, string> = {}) {
  return { params: Promise.resolve(params) }
}

describe("GET /api/admin/aim/runs/:runId", () => {
  beforeEach(() => {
    traceStore.clear()
    snapshotStore.clear()
    vi.clearAllMocks()
  })

  it("returns joined trace + snapshot for a known runId", async () => {
    traceStore.set("run_abc", { id: "trace-1", runId: "run_abc", provider: "deepseek", qualityStatus: "pass" })
    snapshotStore.set("run_abc", { runId: "run_abc", fullPrompt: "..." })

    const res = await getRun(runRequest("http://localhost/api/admin/aim/runs/run_abc"), segment({ runId: "run_abc" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.runId).toBe("run_abc")
    expect(body.data.trace.provider).toBe("deepseek")
    expect(body.data.snapshot.fullPrompt).toBe("...")
    expect(body.data.snapshotExpired).toBe(false)
  })

  it("marks snapshotExpired when the snapshot was cleaned but trace remains", async () => {
    traceStore.set("run_old", { id: "trace-2", runId: "run_old" })

    const res = await getRun(runRequest("http://localhost/api/admin/aim/runs/run_old"), segment({ runId: "run_old" }))
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.data.snapshot).toBeNull()
    expect(body.data.snapshotExpired).toBe(true)
    expect(body.data.trace).not.toBeNull()
  })

  it("404s for an unknown runId", async () => {
    const res = await getRun(runRequest("http://localhost/api/admin/aim/runs/missing"), segment({ runId: "missing" }))
    expect(res.status).toBe(404)
  })

  it("400s when runId is missing", async () => {
    const res = await getRun(runRequest("http://localhost/api/admin/aim/runs/"), segment())
    expect(res.status).toBe(400)
  })
})

describe("GET /api/admin/aim/runs (list)", () => {
  beforeEach(() => {
    traceStore.clear()
    snapshotStore.clear()
    vi.clearAllMocks()
  })

  it("lists harness-instrumented runs (runId not null)", async () => {
    traceStore.set("run_1", { id: "t1", runId: "run_1", agentId: "content_producer", qualityStatus: "pass" })
    traceStore.set("run_2", { id: "t2", runId: "run_2", agentId: "work_editor", degraded: true, qualityStatus: "warn" })

    const res = await listRuns(runRequest("http://localhost/api/admin/aim/runs?limit=10"), segment())
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.total).toBe(2)
    expect(body.data).toHaveLength(2)
  })

  it("filters by degraded=true", async () => {
    traceStore.set("run_1", { id: "t1", runId: "run_1", degraded: false })
    traceStore.set("run_2", { id: "t2", runId: "run_2", degraded: true })

    await listRuns(runRequest("http://localhost/api/admin/aim/runs?degraded=true"), segment())
    // findMany receives a where.degraded=true filter (the route builds it).
    const callArg = aimExecutionTrace.findMany.mock.calls.at(-1)?.[0] as { where?: { degraded?: boolean } }
    expect(callArg?.where?.degraded).toBe(true)
  })
})
