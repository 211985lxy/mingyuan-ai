import { describe, expect, it, vi } from "vitest"

import {
  classifyIsolationSnapshot,
  createIsolationAuditReport,
  lookupRecordClassification,
  planIsolationApply,
  runIsolationAuditCli,
  validateReportForApply,
  type AuditModel,
  type ClassificationSummary,
  type ContentGenerationRunCandidateRow,
  type IsolationAuditReport,
  type IsolationAuditSnapshot,
  type IsolationAuditStore,
  type IsolationAuditTx,
  type RecordClassification,
  type ScriptCandidateRow,
  type VideoCopyExtractionCandidateRow,
} from "@/lib/account-project-isolation-audit"

const ISO = "2026-01-01T00:00:00.000Z"
const NOW_MS = Date.parse("2026-09-06T00:00:00.000Z")

function emptySnapshot(): IsolationAuditSnapshot {
  return {
    scripts: [],
    contentGenerationRuns: [],
    videoCopyExtractions: [],
    competitorAnalyses: [],
    watchAccounts: [],
    crossProjectReferenceCount: 0,
    queuedBackgroundTaskCount: 0,
    queuedAgentInvocationCount: 0,
  }
}

function snapshot(partial: Partial<IsolationAuditSnapshot>): IsolationAuditSnapshot {
  return { ...emptySnapshot(), ...partial }
}

function script(over: Partial<ScriptCandidateRow>): ScriptCandidateRow {
  return { id: "s", userId: "u1", projectId: null, updatedAt: ISO, ...over }
}

function run(over: Partial<ContentGenerationRunCandidateRow>): ContentGenerationRunCandidateRow {
  return { id: "r", userId: "u1", projectId: null, updatedAt: ISO, ...over }
}

function extraction(over: Partial<VideoCopyExtractionCandidateRow>): VideoCopyExtractionCandidateRow {
  return { id: "v", userId: "u1", projectId: null, updatedAt: ISO, ...over }
}

function find(summary: ClassificationSummary, model: AuditModel, id: string): RecordClassification | null {
  return lookupRecordClassification(summary, model, id)
}

function classOf(summary: ClassificationSummary, model: AuditModel, id: string): string | null {
  return find(summary, model, id)?.class ?? null
}

describe("classifyIsolationSnapshot", () => {
  it("classifies a record with no verifiable reference as manual_review", () => {
    const s = snapshot({
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
    })
    const summary = classifyIsolationSnapshot(s)
    expect(classOf(summary, "WatchAccount", "wa-1")).toBe("manual_review")
    expect(summary.perModel.WatchAccount).toMatchObject({
      nullProjectRows: 1,
      manualReview: 1,
      safeToBackfill: 0,
      conflict: 0,
    })
  })

  it("classifies a record with a single provable reference as safe_to_backfill", () => {
    const s = snapshot({
      scripts: [script({ id: "s-1", generationRunProjectId: "p-a" })],
    })
    const summary = classifyIsolationSnapshot(s)
    const rec = find(summary, "Script", "s-1")
    expect(rec?.class).toBe("safe_to_backfill")
    if (rec?.class === "safe_to_backfill") {
      expect(rec.candidateProjectId).toBe("p-a")
      expect(rec.evidenceTypes).toContain("generationRun.projectId")
    }
  })

  it("classifies a record referencing multiple projects as conflict", () => {
    const s = snapshot({
      scripts: [
        script({
          id: "s-conflict",
          generationRunProjectId: "p-a",
          topicSelectionProjectId: "p-b",
        }),
      ],
    })
    const summary = classifyIsolationSnapshot(s)
    const rec = find(summary, "Script", "s-conflict")
    expect(rec?.class).toBe("conflict")
    if (rec?.class === "conflict") {
      expect(rec.candidateProjectIds).toEqual(["p-a", "p-b"])
      expect(rec.conflictReason).toContain("p-a")
      expect(rec.conflictReason).toContain("p-b")
    }
  })

  it("flags a disagreement between a run's ipProfile and topicSelection as conflict", () => {
    const s = snapshot({
      contentGenerationRuns: [
        run({ id: "r-conflict", ipProfileProjectId: "p-a", topicSelectionProjectId: "p-b" }),
      ],
    })
    const summary = classifyIsolationSnapshot(s)
    expect(classOf(summary, "ContentGenerationRun", "r-conflict")).toBe("conflict")
  })

  it("accepts a run whose ipProfile and topicSelection agree", () => {
    const s = snapshot({
      contentGenerationRuns: [
        run({ id: "r-ok", ipProfileProjectId: "p-a", topicSelectionProjectId: "p-a" }),
      ],
    })
    const summary = classifyIsolationSnapshot(s)
    const rec = find(summary, "ContentGenerationRun", "r-ok")
    expect(rec?.class).toBe("safe_to_backfill")
    if (rec?.class === "safe_to_backfill") {
      expect(rec.candidateProjectId).toBe("p-a")
    }
  })

  it("backfills VideoCopyExtraction only from a referencing same-project Inspiration", () => {
    const single = snapshot({
      videoCopyExtractions: [
        extraction({ id: "v-single", referencingInspirationProjectIds: ["p-a"] }),
      ],
    })
    expect(classOf(classifyIsolationSnapshot(single), "VideoCopyExtraction", "v-single")).toBe("safe_to_backfill")

    const none = snapshot({
      videoCopyExtractions: [extraction({ id: "v-none" })],
    })
    expect(classOf(classifyIsolationSnapshot(none), "VideoCopyExtraction", "v-none")).toBe("manual_review")

    const twoProjects = snapshot({
      videoCopyExtractions: [
        extraction({ id: "v-two", referencingInspirationProjectIds: ["p-a", "p-b"] }),
      ],
    })
    expect(classOf(classifyIsolationSnapshot(twoProjects), "VideoCopyExtraction", "v-two")).toBe("conflict")
  })

  it("backfills CompetitorAnalysis only from referencing BenchmarkProfile project ids", () => {
    const s = snapshot({
      competitorAnalyses: [
        {
          id: "c-1",
          userId: "u1",
          projectId: null,
          updatedAt: ISO,
          referencingBenchmarkProfileProjectIds: ["p-a"],
        },
      ],
    })
    expect(classOf(classifyIsolationSnapshot(s), "CompetitorAnalysis", "c-1")).toBe("safe_to_backfill")
  })

  it("never treats User.boundProjectId, single project count, name similarity or recent use as evidence", () => {
    const heuristicScript = script({ id: "s-heuristic" })
    const heuristicRun = run({ id: "r-heuristic" })
    const heuristicExtraction = extraction({ id: "v-heuristic" })
    // Simulate a caller naively attaching forbidden heuristics to the records.
    const looseScript = heuristicScript as ScriptCandidateRow & { boundProjectId?: string; similarProjectName?: string }
    const looseRun = heuristicRun as ContentGenerationRunCandidateRow & { recentUseProjectId?: string; onlyProjectId?: string }
    const looseExtraction = heuristicExtraction as VideoCopyExtractionCandidateRow & { recentUseProjectId?: string }
    looseScript.boundProjectId = "p-bound"
    looseScript.similarProjectName = "p-bound"
    looseRun.onlyProjectId = "p-bound"
    looseRun.recentUseProjectId = "p-bound"
    looseExtraction.recentUseProjectId = "p-bound"

    const s = snapshot({
      scripts: [looseScript],
      contentGenerationRuns: [looseRun],
      videoCopyExtractions: [looseExtraction],
    })
    const summary = classifyIsolationSnapshot(s)
    expect(classOf(summary, "Script", "s-heuristic")).toBe("manual_review")
    expect(classOf(summary, "ContentGenerationRun", "r-heuristic")).toBe("manual_review")
    expect(classOf(summary, "VideoCopyExtraction", "v-heuristic")).toBe("manual_review")
  })

  it("ignores already project-scoped rows (never audits them)", () => {
    const s = snapshot({
      scripts: [
        script({ id: "s-null", generationRunProjectId: "p-a" }),
        script({ id: "s-scoped", projectId: "p-x", generationRunProjectId: "p-a" }),
      ],
    })
    const summary = classifyIsolationSnapshot(s)
    expect(classOf(summary, "Script", "s-null")).toBe("safe_to_backfill")
    expect(find(summary, "Script", "s-scoped")).toBeNull()
    expect(summary.perModel.Script.nullProjectRows).toBe(1)
  })

  it("reports zero-conflict flag and aggregate counts", () => {
    const s = snapshot({
      scripts: [
        script({ id: "s-ok", generationRunProjectId: "p-a" }),
        script({ id: "s-bad", generationRunProjectId: "p-a", topicSelectionProjectId: "p-b" }),
      ],
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
      crossProjectReferenceCount: 3,
      queuedBackgroundTaskCount: 2,
      queuedAgentInvocationCount: 1,
    })
    const summary = classifyIsolationSnapshot(s)
    expect(summary.zeroConflicts).toBe(false)
    expect(summary.total).toMatchObject({ nullProjectRows: 3, safeToBackfill: 1, manualReview: 1, conflict: 1 })
    expect(summary.crossProjectReferenceCount).toBe(3)
    expect(summary.queuedBackgroundTaskCount).toBe(2)
    expect(summary.queuedAgentInvocationCount).toBe(1)
  })
})

describe("report generation", () => {
  it("never leaks record body/chat/knowledge content into the report", () => {
    const marker = "SECRET-CUSTOMER-BODY-CONTENT-7f9c"
    const markerZh = "客户合同原文不得外泄"
    const s = snapshot({
      scripts: [
        script({
          id: "s-marker",
          generationRunProjectId: "p-a",
          topicSelectionProjectId: "p-a",
        }),
      ],
    })
    const loose = s.scripts[0] as ScriptCandidateRow & Record<string, unknown>
    loose.content = marker
    loose.chatText = markerZh

    const summary = classifyIsolationSnapshot(s)
    const report = createIsolationAuditReport(summary, { nowMs: NOW_MS })
    const serialized = JSON.stringify(report)
    expect(serialized).not.toContain(marker)
    expect(serialized).not.toContain(markerZh)
  })

  it("emits a deterministic content-addressed report id with counts, ids and evidence only", () => {
    const s = snapshot({
      scripts: [
        script({ id: "s-a", generationRunProjectId: "p-a" }),
        script({ id: "s-b", generationRunProjectId: "p-a", topicSelectionProjectId: "p-c" }),
      ],
    })
    const summary = classifyIsolationSnapshot(s)
    const report = createIsolationAuditReport(summary, { nowMs: NOW_MS })
    expect(report.reportId).toMatch(/^audit-[0-9a-f]{64}$/)
    expect(report.zeroConflicts).toBe(false)
    expect(report.safeToBackfillRows).toEqual([
      { model: "Script", id: "s-a", candidateProjectId: "p-a", evidenceTypes: ["generationRun.projectId"] },
    ])
    expect(report.conflictRows[0]).toMatchObject({ model: "Script", id: "s-b", candidateProjectIds: ["p-a", "p-c"] })
    expect(report.total).toMatchObject({ nullProjectRows: 2, safeToBackfill: 1, conflict: 1 })
    expect(report.generatedAtMs).toBe(NOW_MS)
    expect(report.expiresAtMs).toBeGreaterThan(NOW_MS)

    // Same data yields the same report id (content-addressed).
    const again = createIsolationAuditReport(summary, { nowMs: NOW_MS + 1000 })
    expect(again.reportId).toBe(report.reportId)
  })
})

describe("validateReportForApply", () => {
  function reportFrom(s: IsolationAuditSnapshot, over: Partial<IsolationAuditReport> = {}): IsolationAuditReport {
    return createIsolationAuditReport(classifyIsolationSnapshot(s), { nowMs: NOW_MS })
  }

  it("accepts an unexpired, zero-conflict report whose id matches its content", () => {
    const s = snapshot({ scripts: [script({ id: "s-1", generationRunProjectId: "p-a" })] })
    const report = reportFrom(s)
    expect(validateReportForApply({ report, nowMs: NOW_MS + 60_000 })).toEqual({ ok: true })
  })

  it("rejects an expired report", () => {
    const s = snapshot({ scripts: [script({ id: "s-1", generationRunProjectId: "p-a" })] })
    const report = reportFrom(s)
    const longAfter = report.expiresAtMs + 1
    expect(validateReportForApply({ report, nowMs: longAfter })).toEqual({
      ok: false,
      reason: "report_expired",
    })
  })

  it("rejects a report that contains conflicts", () => {
    const s = snapshot({
      scripts: [script({ id: "s-c", generationRunProjectId: "p-a", topicSelectionProjectId: "p-b" })],
    })
    const report = reportFrom(s)
    expect(report.zeroConflicts).toBe(false)
    expect(validateReportForApply({ report, nowMs: NOW_MS })).toEqual({
      ok: false,
      reason: "report_has_conflicts",
    })
  })

  it("rejects a report whose id no longer matches its content (tampered or stale)", () => {
    const s = snapshot({ scripts: [script({ id: "s-1", generationRunProjectId: "p-a" })] })
    const report = reportFrom(s)
    report.safeToBackfillRows = [
      ...report.safeToBackfillRows,
      { model: "Script" as const, id: "s-injected", candidateProjectId: "p-zzz", evidenceTypes: ["generationRun.projectId"] },
    ]
    expect(validateReportForApply({ report, nowMs: NOW_MS })).toEqual({ ok: false, reason: "invalid_report_id" })
  })
})

describe("planIsolationApply", () => {
  it("plans only reported safe rows that are still safe with the same candidate", () => {
    const reportSnapshot = snapshot({
      scripts: [
        script({ id: "s-safe", generationRunProjectId: "p-a" }),
        script({ id: "s-changed", generationRunProjectId: "p-b" }),
      ],
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(reportSnapshot), { nowMs: NOW_MS })

    // At apply time the second script's evidence now disagrees (fresh conflict).
    const freshSnapshot = snapshot({
      scripts: [
        script({ id: "s-safe", generationRunProjectId: "p-a" }),
        script({ id: "s-changed", generationRunProjectId: "p-c", topicSelectionProjectId: "p-d" }),
        script({ id: "s-brand-new", generationRunProjectId: "p-e" }),
      ],
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
    })
    const fresh = classifyIsolationSnapshot(freshSnapshot)
    const plan = planIsolationApply({ report, freshSummary: fresh })

    expect(plan.toBackfill).toEqual([{ model: "Script", id: "s-safe", candidateProjectId: "p-a" }])
    expect(plan.skippedChanged).toContainEqual({ model: "Script", id: "s-changed", reason: expect.stringContaining("no longer safe") })
    // Never widens scope to rows that appeared after the report.
    expect(plan.toBackfill.map((t) => t.id)).not.toContain("s-brand-new")
    expect(plan.toBackfill.map((t) => t.id)).not.toContain("wa-1")
  })

  it("skips reported safe rows that were manually scoped before apply", () => {
    const reportSnapshot = snapshot({
      scripts: [script({ id: "s-manual", generationRunProjectId: "p-a" })],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(reportSnapshot), { nowMs: NOW_MS })

    const freshSnapshot = snapshot({
      scripts: [script({ id: "s-manual", projectId: "p-admin", generationRunProjectId: "p-a" })],
    })
    const fresh = classifyIsolationSnapshot(freshSnapshot)
    const plan = planIsolationApply({ report, freshSummary: fresh })
    expect(plan.toBackfill).toEqual([])
    expect(plan.skippedChanged).toContainEqual({ model: "Script", id: "s-manual", reason: expect.stringContaining("already scoped") })
  })
})

describe("runIsolationAuditCli", () => {
  function fakeStore(snapshotToServe: IsolationAuditSnapshot): {
    store: IsolationAuditStore
    setProjectId: ReturnType<typeof vi.fn>
    withTransaction: ReturnType<typeof vi.fn>
  } {
    const setProjectId = vi.fn().mockResolvedValue(1)
    const withTransaction = vi.fn(async (work: (tx: IsolationAuditTx) => Promise<unknown>) =>
      work({
        loadSnapshot: async () => snapshotToServe,
        setProjectId,
      })
    )
    const store: IsolationAuditStore = {
      loadSnapshot: async () => snapshotToServe,
      withTransaction: withTransaction as unknown as IsolationAuditStore["withTransaction"],
    }
    return { store, setProjectId, withTransaction }
  }

  it("dry-run performs zero writes even when safe rows exist", async () => {
    const s = snapshot({
      scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })],
    })
    const { store, setProjectId, withTransaction } = fakeStore(s)
    const result = await runIsolationAuditCli({ store, apply: false, nowMs: NOW_MS })

    expect(result.mode).toBe("dry-run")
    expect(result.validation).toBeUndefined()
    expect(result.report.safeToBackfillRows).toHaveLength(1)
    expect(setProjectId).not.toHaveBeenCalled()
    expect(withTransaction).not.toHaveBeenCalled()
  })

  it("apply updates only safe rows that are still safe, inside a transaction", async () => {
    // The report itself is zero-conflict: one safe Script and one manual WatchAccount.
    const reportSnapshot = snapshot({
      scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })],
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(reportSnapshot), { nowMs: NOW_MS })

    // By apply time a brand-new conflict row exists in the DB; it must NOT block or be updated.
    const freshSnapshot = snapshot({
      scripts: [
        script({ id: "s-safe", generationRunProjectId: "p-a" }),
        script({ id: "s-ambig", generationRunProjectId: "p-b", topicSelectionProjectId: "p-c" }),
      ],
      watchAccounts: [{ id: "wa-1", userId: "u1", projectId: null, updatedAt: ISO }],
    })
    const { store, setProjectId, withTransaction } = fakeStore(freshSnapshot)

    const result = await runIsolationAuditCli({ store, apply: true, report, nowMs: NOW_MS + 60_000 })

    expect(result.validation).toEqual({ ok: true })
    expect(withTransaction).toHaveBeenCalledTimes(1)
    expect(setProjectId).toHaveBeenCalledTimes(1)
    expect(setProjectId).toHaveBeenCalledWith({ model: "Script", id: "s-safe", candidateProjectId: "p-a" })
    expect(result.appliedCount).toBe(1)
    expect(result.writes).toEqual([
      { model: "Script", id: "s-safe", projectId: "p-a", status: "applied" },
    ])
  })

  it("apply refuses expired reports and never writes", async () => {
    const s = snapshot({
      scripts: [script({ id: "s-safe", generationRunProjectId: "p-a" })],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(s), { nowMs: NOW_MS })
    const { store, setProjectId } = fakeStore(s)

    const result = await runIsolationAuditCli({
      store,
      apply: true,
      report,
      nowMs: report.expiresAtMs + 1000,
    })

    expect(result.validation).toEqual({ ok: false, reason: "report_expired" })
    expect(setProjectId).not.toHaveBeenCalled()
  })

  it("apply skips and records rows that changed since the report", async () => {
    const reportSnapshot = snapshot({
      scripts: [
        script({ id: "s-still", generationRunProjectId: "p-a" }),
        script({ id: "s-drifted", generationRunProjectId: "p-a" }),
      ],
    })
    const report = createIsolationAuditReport(classifyIsolationSnapshot(reportSnapshot), { nowMs: NOW_MS })

    // Between the report and apply, s-drifted's evidence disappeared (now manual_review).
    const drifted = snapshot({
      scripts: [
        script({ id: "s-still", generationRunProjectId: "p-a" }),
        script({ id: "s-drifted" }),
      ],
    })
    const { store, setProjectId } = fakeStore(drifted)
    const result = await runIsolationAuditCli({ store, apply: true, report, nowMs: NOW_MS + 60_000 })

    expect(result.validation).toEqual({ ok: true })
    expect(setProjectId).toHaveBeenCalledTimes(1)
    expect(setProjectId).toHaveBeenCalledWith({ model: "Script", id: "s-still", candidateProjectId: "p-a" })
    expect(result.plan?.skippedChanged).toContainEqual({
      model: "Script",
      id: "s-drifted",
      reason: expect.stringContaining("no longer safe"),
    })
    expect(result.writes?.map((w) => w.id)).not.toContain("s-drifted")
  })
})
