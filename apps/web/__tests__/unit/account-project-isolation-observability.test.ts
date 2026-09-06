import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// ---------------------------------------------------------------------------
// Task 10 — isolation observability regression tests.
//
// Drives the REAL event sites and asserts the content-free counters move:
//   - project_context_mismatch_total  at the execution gate rejection loggers
//     (account-project-context.ts + aim-observability.ts) — entry + code only.
//   - legacy_null_scope_blocked_total at the Task-4 null-project guard in
//     script-structure-store.getStructure — legacy record type only.
//   - stale_task_quarantined_total    at the Task-6 quarantine primitives
//     (background-tasks.ts + invocation-service.ts) — code only.
//
// A customer-content marker is threaded through userId / taskId / expected
// project id / error text; the metric reader + Prometheus-text render must
// never contain it (only the fixed label vocabulary is ever stored).
// ---------------------------------------------------------------------------

// Content marker that must NEVER appear in any metric output.
const CONTENT_MARKER = "ACME客户机密_KPI_2026_正文_勿外传"

// ---------------------------------------------------------------------------
// Prisma mock — the guard reads prisma.user/prisma.clientProject, the legacy
// structure guard reads prisma.videoStructure; the quarantine primitives
// receive their own injected prisma handle like every other unit test here.
// ---------------------------------------------------------------------------
const mocks = vi.hoisted(() => {
  const user = { findUnique: vi.fn() }
  const clientProject = { findFirst: vi.fn(), count: vi.fn() }
  const videoStructure = { findUnique: vi.fn() }
  const backgroundTask = { updateMany: vi.fn(), findUnique: vi.fn() }
  const agentInvocation = { updateMany: vi.fn() }
  return {
    user,
    clientProject,
    videoStructure,
    backgroundTask,
    agentInvocation,
    prisma: { user, clientProject, videoStructure, backgroundTask, agentInvocation },
  }
})

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }))
// Invocation-service import surface (same mocks as account-project-stale-resources).
vi.mock("@/lib/agent-api-auth", () => ({
  assertAgentProjectAccess: vi.fn(),
  assertAgentAccess: vi.fn(),
}))
vi.mock("@/lib/agent-token-quota", () => ({
  checkMinuteQuota: vi.fn(async () => ({ allowed: true })),
  assertDailyTokenBudget: vi.fn(),
}))
vi.mock("@/lib/aim-generator", () => ({}))

import {
  ACCOUNT_PROJECT_CONTEXT_STALE,
  assertAccountProjectExecutionContext,
  logAccountProjectContextRejection,
} from "@/lib/account-project-context"
import { cancelStaleProjectBackgroundTask } from "@/lib/background-tasks"
import { failStaleProjectAgentInvocation } from "@/lib/aim-remote/invocation-service"
import { getStructure } from "@/lib/aim/script-structure-store"
import { logAimProjectContextRejection } from "@/lib/aim-observability"
import {
  readIsolationMetric,
  renderIsolationMetrics,
  resetIsolationMetricsForTests,
} from "@/lib/account-project-isolation-metrics"

let consoleErrorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  resetIsolationMetricsForTests()
  vi.clearAllMocks()
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  resetIsolationMetricsForTests()
})

function legacyStructureRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "vs-legacy-1",
    name: "结构模板",
    displayName: "结构模板",
    description: null,
    blueprint: {},
    origin: "extracted",
    sourceScriptsCount: 0,
    userId: "user-1",
    projectId: null,
    status: "published",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

// ---------------------------------------------------------------------------
// project_context_mismatch_total — worker gate (account-project-context.ts)
// ---------------------------------------------------------------------------
describe("project_context_mismatch_total (execution gate)", () => {
  it("increments {entry:source, code} once when the gate rejects a real mismatch", async () => {
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "project-ai" })

    let caught: unknown
    try {
      await assertAccountProjectExecutionContext({
        userId: "user-1",
        projectId: "project-heating",
        source: "remote",
      })
    } catch (error) {
      caught = error
    }
    expect((caught as { code?: string }).code).toBe("PROJECT_CONTEXT_MISMATCH")

    // The worker records the rejection through the shared audit logger, which is
    // the single counting point for gate rejections.
    await logAccountProjectContextRejection({
      source: "remote",
      userId: `user-1-${CONTENT_MARKER}`,
      taskId: `task-1-${CONTENT_MARKER}`,
      expectedProjectId: `project-heating-${CONTENT_MARKER}`,
      error: caught,
    })

    expect(
      readIsolationMetric("project_context_mismatch_total", {
        entry: "remote",
        code: "PROJECT_CONTEXT_MISMATCH",
      }),
    ).toBe(1)
    // Different codes are separate series (e.g. bound project vanished).
    expect(
      readIsolationMetric("project_context_mismatch_total", {
        entry: "remote",
        code: "BOUND_PROJECT_UNAVAILABLE",
      }),
    ).toBe(0)
    // Render uses ONLY entry + code dimensions.
    expect(renderIsolationMetrics()).toContain(
      'project_context_mismatch_total{entry="remote",code="PROJECT_CONTEXT_MISMATCH"} 1',
    )
  })

  it("counts BOUND_PROJECT_UNAVAILABLE as its own code series", async () => {
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "project-old" })
    mocks.clientProject.findFirst.mockResolvedValue(null)

    let caught: unknown
    try {
      await assertAccountProjectExecutionContext({
        userId: "user-1",
        projectId: "project-old",
        source: "background",
      })
    } catch (error) {
      caught = error
    }
    expect((caught as { code?: string }).code).toBe("BOUND_PROJECT_UNAVAILABLE")

    await logAccountProjectContextRejection({
      source: "background",
      userId: "user-1",
      taskId: "task-1",
      expectedProjectId: "project-old",
      error: caught,
    })

    expect(
      readIsolationMetric("project_context_mismatch_total", {
        entry: "background",
        code: "BOUND_PROJECT_UNAVAILABLE",
      }),
    ).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// project_context_mismatch_total — web/generate path (aim-observability.ts)
// ---------------------------------------------------------------------------
describe("project_context_mismatch_total (web generate path)", () => {
  it("increments with normalized web entry and never renders the content marker", async () => {
    await logAimProjectContextRejection({
      source: "generate",
      userId: `user-web-${CONTENT_MARKER}`,
      requestedProjectId: `project-client-${CONTENT_MARKER}`,
      error: {
        code: "PROJECT_CONTEXT_MISMATCH",
        message: `internal error mentioning ${CONTENT_MARKER}`,
      },
    })

    expect(
      readIsolationMetric("project_context_mismatch_total", {
        entry: "web",
        code: "PROJECT_CONTEXT_MISMATCH",
      }),
    ).toBe(1)
    expect(renderIsolationMetrics()).not.toContain(CONTENT_MARKER)
  })
})

// ---------------------------------------------------------------------------
// stale_task_quarantined_total — quarantine primitives
// ---------------------------------------------------------------------------
describe("stale_task_quarantined_total (quarantine primitives)", () => {
  it("increments only when cancelStaleProjectBackgroundTask really quarantines a pending task", async () => {
    mocks.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
    const count = await cancelStaleProjectBackgroundTask(
      mocks.prisma as never,
      `task-old-${CONTENT_MARKER}`,
      new Date(),
    )
    expect(count).toBe(1)
    expect(
      readIsolationMetric("stale_task_quarantined_total", {
        code: ACCOUNT_PROJECT_CONTEXT_STALE,
      }),
    ).toBe(1)
    expect(renderIsolationMetrics()).not.toContain(CONTENT_MARKER)
  })

  it("does NOT increment when nothing matched (completed history is never rewritten)", async () => {
    mocks.backgroundTask.updateMany.mockResolvedValue({ count: 0 })
    await cancelStaleProjectBackgroundTask(mocks.prisma as never, "task-done", new Date())
    expect(
      readIsolationMetric("stale_task_quarantined_total", {
        code: ACCOUNT_PROJECT_CONTEXT_STALE,
      }),
    ).toBe(0)
  })

  it("increments when failStaleProjectAgentInvocation quarantines a queued/running invocation", async () => {
    mocks.agentInvocation.updateMany.mockResolvedValue({ count: 1 })
    const updated = await failStaleProjectAgentInvocation(
      mocks.prisma as never,
      `inv-old-${CONTENT_MARKER}`,
      new Date(),
    )
    expect(updated).toBe(1)
    expect(
      readIsolationMetric("stale_task_quarantined_total", {
        code: ACCOUNT_PROJECT_CONTEXT_STALE,
      }),
    ).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// legacy_null_scope_blocked_total — script-structure null-project guard
// ---------------------------------------------------------------------------
describe("legacy_null_scope_blocked_total (script structures)", () => {
  it("increments {type:script_structure} when a legacy null-project extracted structure is refused", async () => {
    mocks.videoStructure.findUnique.mockResolvedValue(
      legacyStructureRow({ userId: `user-1-${CONTENT_MARKER}` }),
    )

    const record = await getStructure("vs-legacy-1", `user-1-${CONTENT_MARKER}`, "project-ai")

    expect(record).toBeNull()
    expect(
      readIsolationMetric("legacy_null_scope_blocked_total", { type: "script_structure" }),
    ).toBe(1)
    // Render carries only the fixed type dimension — no ids, no content.
    expect(renderIsolationMetrics()).not.toContain(CONTENT_MARKER)
    expect(renderIsolationMetrics()).not.toContain("user-1")
  })

  it("does NOT increment for canonical public templates (legitimately project-less)", async () => {
    mocks.videoStructure.findUnique.mockResolvedValue(
      legacyStructureRow({ origin: "canonical", projectId: null }),
    )

    const record = await getStructure("vs-canonical", "user-1", "project-ai")

    expect(record).not.toBeNull()
    expect(
      readIsolationMetric("legacy_null_scope_blocked_total", { type: "script_structure" }),
    ).toBe(0)
  })

  it("does NOT count a different-project extracted structure as a legacy-null block", async () => {
    mocks.videoStructure.findUnique.mockResolvedValue(
      legacyStructureRow({ projectId: "project-b" }),
    )

    const record = await getStructure("vs-b", "user-1", "project-ai")

    expect(record).toBeNull()
    expect(
      readIsolationMetric("legacy_null_scope_blocked_total", { type: "script_structure" }),
    ).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// Content-free guarantee across the whole payload
// ---------------------------------------------------------------------------
describe("isolation metric payload is content-free", () => {
  it("renders ONLY entry/type + code label vocabularies and no content marker anywhere", async () => {
    mocks.user.findUnique.mockResolvedValue({ boundProjectId: "project-ai" })
    mocks.backgroundTask.updateMany.mockResolvedValue({ count: 1 })
    mocks.agentInvocation.updateMany.mockResolvedValue({ count: 1 })
    mocks.videoStructure.findUnique.mockResolvedValue(
      legacyStructureRow({ userId: `user-${CONTENT_MARKER}` }),
    )

    // Fire all three real event families with content markers threaded through.
    let caught: unknown
    try {
      await assertAccountProjectExecutionContext({
        userId: `user-${CONTENT_MARKER}`,
        projectId: "project-heating",
        source: "newsroom",
      })
    } catch (error) {
      caught = error
    }
    await logAccountProjectContextRejection({
      source: "newsroom",
      userId: `user-${CONTENT_MARKER}`,
      taskId: `task-${CONTENT_MARKER}`,
      expectedProjectId: `project-${CONTENT_MARKER}`,
      error: caught,
    })
    await logAimProjectContextRejection({
      source: "generate",
      userId: `user-${CONTENT_MARKER}`,
      requestedProjectId: `project-${CONTENT_MARKER}`,
      error: caught,
    })
    await cancelStaleProjectBackgroundTask(mocks.prisma as never, `task-${CONTENT_MARKER}`, new Date())
    await failStaleProjectAgentInvocation(mocks.prisma as never, `inv-${CONTENT_MARKER}`, new Date())
    await getStructure("vs-legacy-1", `user-${CONTENT_MARKER}`, "project-ai")

    const render = renderIsolationMetrics()
    expect(render).not.toContain(CONTENT_MARKER)
    // No user/task/project ids ever enter the payload.
    expect(render).not.toMatch(/user-|task-|inv-|project-/)
    // Fixed vocabulary only: entry/type/code label names.
    expect(render).toContain('project_context_mismatch_total{entry="newsroom",code="PROJECT_CONTEXT_MISMATCH"} 1')
    expect(render).toContain('project_context_mismatch_total{entry="web",code="PROJECT_CONTEXT_MISMATCH"} 1')
    expect(render).toContain('stale_task_quarantined_total{code="ACCOUNT_PROJECT_CONTEXT_STALE"} 2')
    expect(render).toContain('legacy_null_scope_blocked_total{type="script_structure"} 1')
  })
})
