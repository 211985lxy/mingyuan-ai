/**
 * Conservative audit + backfill engine for account/project isolation.
 *
 * Scope: five legacy account-scoped models that now carry nullable `projectId`
 * (Script, ContentGenerationRun in content.prisma; VideoCopyExtraction,
 * CompetitorAnalysis, WatchAccount in competitor.prisma). Historical rows with
 * `projectId = null` are classified using PROVABLE reference evidence only:
 *
 *   - Script                -> generationRun.projectId (+ topicSelection.projectId)
 *   - ContentGenerationRun  -> topicSelection.projectId, project-scoped child Script
 *                             projectIds, and (reserved) ipProfile.projectId.
 *   - VideoCopyExtraction   -> projectIds of Inspirations that reference it.
 *   - CompetitorAnalysis    -> projectIds of BenchmarkProfiles that reference it.
 *   - WatchAccount          -> no supported source (always manual_review).
 *
 * `User.boundProjectId`, "only one project exists", name similarity and recent
 * use are NEVER accepted as evidence: those fields are not part of the record
 * shapes this engine reads, so they can never influence a class.
 *
 * NOTE on `ipProfile.projectId`: the current Prisma schema has NO projectId on
 * IpProfile. The engine still implements the "ipProfile must agree with
 * topicSelection" rule so it is unit-testable and ready if the field is ever
 * added; the data layer simply never supplies it today.
 *
 * DB-free by design: the engine consumes plain record arrays and an injected
 * store/transaction interface, so classification, report generation, expiry,
 * conflict detection and apply planning are all unit-testable without Prisma,
 * DATABASE_URL or a live DB. scripts/audit-account-project-isolation.ts is the
 * only place that talks to MySQL.
 *
 * Reports are strictly content-free: counts, record ids, candidate project ids,
 * evidence type labels and conflict reasons only. No body/chat/knowledge text
 * is ever carried into a report.
 */
import { createHash } from "node:crypto"

export const DEFAULT_REPORT_TTL_MS = 30 * 60 * 1000 // 30 minutes

export const AUDIT_MODELS = [
  "Script",
  "ContentGenerationRun",
  "VideoCopyExtraction",
  "CompetitorAnalysis",
  "WatchAccount",
] as const
export type AuditModel = (typeof AUDIT_MODELS)[number]
export type AuditClass = "safe_to_backfill" | "manual_review" | "conflict"
export type EvidenceType =
  | "generationRun.projectId"
  | "ipProfile.projectId"
  | "topicSelection.projectId"
  | "Script.projectId"
  | "Inspiration.projectId"
  | "BenchmarkProfile.projectId"

/* ---------------------------- record shapes ---------------------------- */
// Only the fields below are ever read; extra properties (e.g. content) are ignored.

export interface ScriptCandidateRow {
  id: string
  userId: string
  projectId: string | null
  updatedAt: string
  /** ContentGenerationRun.projectId of the run referenced by generationRunId. */
  generationRunProjectId?: string | null
  /** TopicSelection.projectId of the topic selection referenced by topicSelectionId. */
  topicSelectionProjectId?: string | null
}

export interface ContentGenerationRunCandidateRow {
  id: string
  userId: string
  projectId: string | null
  updatedAt: string
  /** Reserved: IpProfile has no projectId in the current schema; data layer leaves it unset. */
  ipProfileProjectId?: string | null
  /** TopicSelection.projectId of the topic selection referenced by topicSelectionId. */
  topicSelectionProjectId?: string | null
  /** projectIds of this run's project-scoped Script children (Script.generationRunId = run.id). */
  childScriptProjectIds?: string[]
}

export interface VideoCopyExtractionCandidateRow {
  id: string
  userId: string
  projectId: string | null
  updatedAt: string
  /** projectIds of same-user Inspirations referencing this extraction via videoCopyExtractionId. */
  referencingInspirationProjectIds?: string[]
}

export interface CompetitorAnalysisCandidateRow {
  id: string
  userId: string
  projectId: string | null
  updatedAt: string
  /** projectIds of same-user BenchmarkProfiles referencing this analysis via competitorAnalysisId. */
  referencingBenchmarkProfileProjectIds?: string[]
}

export interface WatchAccountCandidateRow {
  id: string
  userId: string
  projectId: string | null
  updatedAt: string
}

export interface IsolationAuditSnapshot {
  scripts: ScriptCandidateRow[]
  contentGenerationRuns: ContentGenerationRunCandidateRow[]
  videoCopyExtractions: VideoCopyExtractionCandidateRow[]
  competitorAnalyses: CompetitorAnalysisCandidateRow[]
  watchAccounts: WatchAccountCandidateRow[]
  /** Data-layer computed: already-scoped rows whose project disagrees with a referenced record's project. */
  crossProjectReferenceCount: number
  queuedBackgroundTaskCount: number
  queuedAgentInvocationCount: number
}

/* ---------------------------- classification ---------------------------- */

interface ReferenceEdge {
  evidenceType: EvidenceType
  projectId: string | null
}

function collectEvidence(model: AuditModel, row: unknown): ReferenceEdge[] {
  switch (model) {
    case "Script": {
      const r = row as ScriptCandidateRow
      return [
        { evidenceType: "generationRun.projectId", projectId: r.generationRunProjectId ?? null },
        { evidenceType: "topicSelection.projectId", projectId: r.topicSelectionProjectId ?? null },
      ]
    }
    case "ContentGenerationRun": {
      const r = row as ContentGenerationRunCandidateRow
      return [
        { evidenceType: "ipProfile.projectId", projectId: r.ipProfileProjectId ?? null },
        { evidenceType: "topicSelection.projectId", projectId: r.topicSelectionProjectId ?? null },
        ...(r.childScriptProjectIds ?? []).map(
          (pid): ReferenceEdge => ({ evidenceType: "Script.projectId", projectId: pid })
        ),
      ]
    }
    case "VideoCopyExtraction": {
      const r = row as VideoCopyExtractionCandidateRow
      return (r.referencingInspirationProjectIds ?? []).map(
        (pid): ReferenceEdge => ({ evidenceType: "Inspiration.projectId", projectId: pid })
      )
    }
    case "CompetitorAnalysis": {
      const r = row as CompetitorAnalysisCandidateRow
      return (r.referencingBenchmarkProfileProjectIds ?? []).map(
        (pid): ReferenceEdge => ({ evidenceType: "BenchmarkProfile.projectId", projectId: pid })
      )
    }
    case "WatchAccount":
      return [] // no supported reference source -> never auto-backfillable
  }
}

export type RecordClassification =
  | { model: AuditModel; id: string; class: "safe_to_backfill"; candidateProjectId: string; evidenceTypes: EvidenceType[] }
  | { model: AuditModel; id: string; class: "manual_review" }
  | { model: AuditModel; id: string; class: "conflict"; candidateProjectIds: string[]; conflictReason: string }

export function classifyRecord(model: AuditModel, row: unknown): RecordClassification {
  const id = (row as { id: string }).id
  const byProject = new Map<string, EvidenceType[]>()
  for (const edge of collectEvidence(model, row)) {
    if (!edge.projectId) continue
    const labels = byProject.get(edge.projectId) ?? []
    if (!labels.includes(edge.evidenceType)) labels.push(edge.evidenceType)
    byProject.set(edge.projectId, labels)
  }
  const candidates = [...byProject.keys()].sort()
  if (candidates.length === 0) return { model, id, class: "manual_review" }
  if (candidates.length === 1) {
    return {
      model,
      id,
      class: "safe_to_backfill",
      candidateProjectId: candidates[0],
      evidenceTypes: [...(byProject.get(candidates[0]) ?? [])].sort(),
    }
  }
  const reason = candidates.map((p) => `${p} via ${(byProject.get(p) ?? []).join("|")}`).join(", ")
  return { model, id, class: "conflict", candidateProjectIds: candidates, conflictReason: `references multiple projects: ${reason}` }
}

export interface ModelClassCounts {
  nullProjectRows: number
  safeToBackfill: number
  manualReview: number
  conflict: number
}

export interface ClassificationSummary {
  records: RecordClassification[]
  perModel: Record<AuditModel, ModelClassCounts>
  total: ModelClassCounts
  zeroConflicts: boolean
  crossProjectReferenceCount: number
  queuedBackgroundTaskCount: number
  queuedAgentInvocationCount: number
}

function emptyCounts(): ModelClassCounts {
  return { nullProjectRows: 0, safeToBackfill: 0, manualReview: 0, conflict: 0 }
}

export function classifyIsolationSnapshot(snapshot: IsolationAuditSnapshot): ClassificationSummary {
  const candidates: Array<{ model: AuditModel; row: unknown }> = [
    ...snapshot.scripts.map((r) => ({ model: "Script" as const, row: r })),
    ...snapshot.contentGenerationRuns.map((r) => ({ model: "ContentGenerationRun" as const, row: r })),
    ...snapshot.videoCopyExtractions.map((r) => ({ model: "VideoCopyExtraction" as const, row: r })),
    ...snapshot.competitorAnalyses.map((r) => ({ model: "CompetitorAnalysis" as const, row: r })),
    ...snapshot.watchAccounts.map((r) => ({ model: "WatchAccount" as const, row: r })),
  ]
  const perModel = Object.fromEntries(AUDIT_MODELS.map((m) => [m, emptyCounts()])) as Record<AuditModel, ModelClassCounts>
  const total = emptyCounts()
  const records: RecordClassification[] = []
  for (const { model, row } of candidates) {
    if ((row as { projectId: string | null }).projectId !== null) continue // only historical null rows are audited
    const classification = classifyRecord(model, row)
    records.push(classification)
    perModel[model].nullProjectRows += 1
    total.nullProjectRows += 1
    if (classification.class === "safe_to_backfill") {
      perModel[model].safeToBackfill += 1
      total.safeToBackfill += 1
    } else if (classification.class === "manual_review") {
      perModel[model].manualReview += 1
      total.manualReview += 1
    } else {
      perModel[model].conflict += 1
      total.conflict += 1
    }
  }
  records.sort((a, b) => `${a.model}:${a.id}`.localeCompare(`${b.model}:${b.id}`))
  return {
    records,
    perModel,
    total,
    zeroConflicts: total.conflict === 0,
    crossProjectReferenceCount: Math.max(0, Math.floor(snapshot.crossProjectReferenceCount) || 0),
    queuedBackgroundTaskCount: Math.max(0, Math.floor(snapshot.queuedBackgroundTaskCount) || 0),
    queuedAgentInvocationCount: Math.max(0, Math.floor(snapshot.queuedAgentInvocationCount) || 0),
  }
}

export function lookupRecordClassification(summary: ClassificationSummary, model: AuditModel, id: string): RecordClassification | null {
  for (const rec of summary.records) {
    if (rec.model === model && rec.id === id) return rec
  }
  return null
}

/* ------------------------------- report ------------------------------- */

export interface SafeRowEntry {
  model: AuditModel
  id: string
  candidateProjectId: string
  evidenceTypes: EvidenceType[]
}
export interface ManualRowEntry {
  model: AuditModel
  id: string
}
export interface ConflictRowEntry {
  model: AuditModel
  id: string
  candidateProjectIds: string[]
  conflictReason: string
}

export interface IsolationAuditReport {
  reportId: string
  generatedAtMs: number
  expiresAtMs: number
  zeroConflicts: boolean
  perModel: Record<AuditModel, ModelClassCounts>
  total: ModelClassCounts
  safeToBackfillRows: SafeRowEntry[]
  manualReviewRows: ManualRowEntry[]
  conflictRows: ConflictRowEntry[]
  crossProjectReferenceCount: number
  queuedBackgroundTaskCount: number
  queuedAgentInvocationCount: number
}

/** Stable, content-free canonical string used for report addressing. */
function canonicalRecords(records: RecordClassification[]): string {
  const lines = [...records]
    .sort((a, b) => `${a.model}:${a.id}`.localeCompare(`${b.model}:${b.id}`))
    .map((rec) => {
      switch (rec.class) {
        case "safe_to_backfill":
          return `safe:${rec.model}:${rec.id}:${rec.candidateProjectId}:${[...rec.evidenceTypes].sort().join("+")}`
        case "manual_review":
          return `manual:${rec.model}:${rec.id}`
        case "conflict":
          return `conflict:${rec.model}:${rec.id}:${[...rec.candidateProjectIds].sort().join("+")}:${rec.conflictReason}`
      }
    })
  return createHash("sha256").update(`account-project-isolation-audit:v1:${lines.join("|")}`).digest("hex")
}

function rowsToRecords(report: Pick<IsolationAuditReport, "safeToBackfillRows" | "manualReviewRows" | "conflictRows">): RecordClassification[] {
  const records: RecordClassification[] = []
  for (const r of report.safeToBackfillRows) {
    records.push({ model: r.model, id: r.id, class: "safe_to_backfill", candidateProjectId: r.candidateProjectId, evidenceTypes: r.evidenceTypes })
  }
  for (const r of report.manualReviewRows) {
    records.push({ model: r.model, id: r.id, class: "manual_review" })
  }
  for (const r of report.conflictRows) {
    records.push({ model: r.model, id: r.id, class: "conflict", candidateProjectIds: r.candidateProjectIds, conflictReason: r.conflictReason })
  }
  return records
}

export function createIsolationAuditReport(summary: ClassificationSummary, opts?: { nowMs?: number; reportTtlMs?: number }): IsolationAuditReport {
  const nowMs = opts?.nowMs ?? Date.now()
  const ttlMs = opts?.reportTtlMs ?? DEFAULT_REPORT_TTL_MS
  const safeToBackfillRows: SafeRowEntry[] = []
  const manualReviewRows: ManualRowEntry[] = []
  const conflictRows: ConflictRowEntry[] = []
  for (const rec of summary.records) {
    if (rec.class === "safe_to_backfill") {
      safeToBackfillRows.push({ model: rec.model, id: rec.id, candidateProjectId: rec.candidateProjectId, evidenceTypes: rec.evidenceTypes })
    } else if (rec.class === "manual_review") {
      manualReviewRows.push({ model: rec.model, id: rec.id })
    } else {
      conflictRows.push({ model: rec.model, id: rec.id, candidateProjectIds: rec.candidateProjectIds, conflictReason: rec.conflictReason })
    }
  }
  return {
    reportId: `audit-${canonicalRecords(summary.records)}`,
    generatedAtMs: nowMs,
    expiresAtMs: nowMs + ttlMs,
    zeroConflicts: summary.zeroConflicts,
    perModel: summary.perModel,
    total: summary.total,
    safeToBackfillRows,
    manualReviewRows,
    conflictRows,
    crossProjectReferenceCount: summary.crossProjectReferenceCount,
    queuedBackgroundTaskCount: summary.queuedBackgroundTaskCount,
    queuedAgentInvocationCount: summary.queuedAgentInvocationCount,
  }
}

/* ----------------------- apply validation and plan ----------------------- */

export type ReportValidation = { ok: true } | { ok: false; reason: string }

export function validateReportForApply(input: { report: IsolationAuditReport; nowMs: number }): ReportValidation {
  const { report, nowMs } = input
  if (!report.reportId.startsWith("audit-")) return { ok: false, reason: "invalid_report_id" }
  if (canonicalRecords(rowsToRecords(report)) !== report.reportId.slice("audit-".length)) return { ok: false, reason: "invalid_report_id" }
  if (nowMs > report.expiresAtMs) return { ok: false, reason: "report_expired" }
  if (!report.zeroConflicts) return { ok: false, reason: "report_has_conflicts" }
  return { ok: true }
}

export interface ApplyTarget {
  model: AuditModel
  id: string
  candidateProjectId: string
}
export interface SkippedChangedRow {
  model: AuditModel
  id: string
  reason: string
}
export interface ApplyPlan {
  toBackfill: ApplyTarget[]
  skippedChanged: SkippedChangedRow[]
}

export function planIsolationApply(input: { report: IsolationAuditReport; freshSummary: ClassificationSummary }): ApplyPlan {
  const toBackfill: ApplyTarget[] = []
  const skippedChanged: SkippedChangedRow[] = []
  for (const row of input.report.safeToBackfillRows) {
    const fresh = lookupRecordClassification(input.freshSummary, row.model, row.id)
    if (!fresh) {
      skippedChanged.push({ model: row.model, id: row.id, reason: "already scoped since report" })
      continue
    }
    if (fresh.class !== "safe_to_backfill") {
      skippedChanged.push({ model: row.model, id: row.id, reason: `no longer safe: reclassified ${fresh.class}` })
      continue
    }
    if (fresh.candidateProjectId !== row.candidateProjectId) {
      skippedChanged.push({
        model: row.model,
        id: row.id,
        reason: `candidate changed since report (${row.candidateProjectId} -> ${fresh.candidateProjectId})`,
      })
      continue
    }
    toBackfill.push({ model: row.model, id: row.id, candidateProjectId: row.candidateProjectId })
  }
  return { toBackfill, skippedChanged }
}

/* --------------------------- store + orchestration --------------------------- */

export interface IsolationAuditStore {
  /** Read the full audit snapshot (read-only). */
  loadSnapshot(): Promise<IsolationAuditSnapshot>
  /** Execute `work` inside a transaction; apply re-verifies against the transaction's own reads. */
  withTransaction<T>(work: (tx: IsolationAuditTx) => Promise<T>): Promise<T>
}

export interface IsolationAuditTx {
  loadSnapshot(): Promise<IsolationAuditSnapshot>
  /** Conditional write: only succeeds while the row still has projectId = null. Returns rows updated (0 | 1). */
  setProjectId(target: ApplyTarget): Promise<number>
  /**
   * Task 6 quarantine extension (optional). A data layer that supports proactive
   * quarantine of stale queued/in-flight resources implements all three members
   * together; Task 5 data layers that do not are left untouched (see
   * `quarantineStaleQueuedResources` on `RunIsolationAuditCliInput`).
   *
   * List queued/pending/in-flight resources whose project no longer matches the
   * owning account's current binding. Ids only — reports stay content-free.
   */
  loadStaleQueuedResources?(): Promise<StaleQueuedResources>
  /** Conditional write: fail a stale queued/running AgentInvocation with the stable code. Returns rows updated (0 | 1). */
  quarantineStaleAgentInvocation?(id: string): Promise<number>
  /** Conditional write: cancel a stale queued/leased/retry-wait BackgroundTask with the stable reason. Returns rows updated (0 | 1). */
  quarantineStaleBackgroundTask?(id: string): Promise<number>
}

/** A stale pending resource the data layer identified for quarantine (ids only; reports stay content-free). */
export interface StaleQueuedResourceTarget {
  id: string
}
export interface StaleQueuedResources {
  agentInvocations: StaleQueuedResourceTarget[]
  backgroundTasks: StaleQueuedResourceTarget[]
}

export interface QuarantineClassOutcome {
  listed: number
  updated: number
  skippedRaced: number
}
/** Per-class quarantine counts surfaced so the CLI can write them to the audit log. */
export interface QuarantineApplyResult {
  agentInvocations: QuarantineClassOutcome
  backgroundTasks: QuarantineClassOutcome
}

export type ApplyWriteStatus = "applied" | "raced"
export interface ApplyWrite {
  model: AuditModel
  id: string
  projectId: string
  status: ApplyWriteStatus
}

export interface AuditCliResult {
  mode: "dry-run" | "apply"
  report: IsolationAuditReport
  validation?: ReportValidation
  plan?: ApplyPlan
  appliedCount: number
  skippedRacedCount: number
  writes: ApplyWrite[]
  /** Task 6: set in apply mode when `quarantineStaleQueuedResources` is requested. */
  quarantine?: QuarantineApplyResult | null
}

export interface RunIsolationAuditCliInput {
  store: IsolationAuditStore
  /** False (default) -> read-only audit report; never touches the store write path. */
  apply: boolean
  /** For apply mode: the report previously produced (loaded by the CLI from --report-id). */
  report?: IsolationAuditReport | null
  nowMs?: number
  reportTtlMs?: number
  /**
   * Task 6: when apply runs, also quarantine stale queued/in-flight resources
   * (AgentInvocation + BackgroundTask) inside the SAME transaction, so a binding
   * change and its old-project task disposal are all-or-nothing. Requires the
   * optional quarantine extension on `IsolationAuditTx`.
   */
  quarantineStaleQueuedResources?: boolean
}

export async function runIsolationAuditCli(input: RunIsolationAuditCliInput): Promise<AuditCliResult> {
  const nowMs = input.nowMs ?? Date.now()
  const reportTtlMs = input.reportTtlMs ?? DEFAULT_REPORT_TTL_MS

  if (!input.apply) {
    const summary = classifyIsolationSnapshot(await input.store.loadSnapshot())
    const report = createIsolationAuditReport(summary, { nowMs, reportTtlMs })
    return { mode: "dry-run", report, appliedCount: 0, skippedRacedCount: 0, writes: [] }
  }

  if (!input.report) {
    throw new Error("apply mode requires the audit report produced by the latest audit run (--report-id)")
  }
  const report = input.report
  return input.store.withTransaction(async (tx): Promise<AuditCliResult> => {
    const freshSummary = classifyIsolationSnapshot(await tx.loadSnapshot())
    const validation = validateReportForApply({ report, nowMs })
    if (!validation.ok) return { mode: "apply", report, validation, appliedCount: 0, skippedRacedCount: 0, writes: [], quarantine: null }

    const plan = planIsolationApply({ report, freshSummary })
    const writes: ApplyWrite[] = []
    let appliedCount = 0
    let skippedRacedCount = 0
    for (const target of plan.toBackfill) {
      const updated = await tx.setProjectId(target)
      if (updated > 0) {
        appliedCount += 1
        writes.push({ model: target.model, id: target.id, projectId: target.candidateProjectId, status: "applied" })
      } else {
        skippedRacedCount += 1 // a concurrent writer set projectId: never widen scope
        writes.push({ model: target.model, id: target.id, projectId: target.candidateProjectId, status: "raced" })
      }
    }
    // Task 6: quarantine stale queued/in-flight resources in the SAME transaction.
    // Any failure here propagates and rolls the whole transaction back, so a
    // binding/schema change can never leave "old project tasks still active".
    const quarantine = input.quarantineStaleQueuedResources
      ? await quarantineStaleQueuedResourcesInTx(tx)
      : null
    return { mode: "apply", report, validation, plan, appliedCount, skippedRacedCount, writes, quarantine }
  })
}

/**
 * Orchestrate the per-class quarantine of stale queued resources. Each class
 * (AgentInvocation vs BackgroundTask) is counted independently; a rejected
 * conditional write is recorded as skipped/raced (a concurrent writer already
 * finalised the row), while a thrown write error propagates so the surrounding
 * DB transaction rolls back (no half state).
 */
async function quarantineStaleQueuedResourcesInTx(tx: IsolationAuditTx): Promise<QuarantineApplyResult> {
  if (!tx.loadStaleQueuedResources || !tx.quarantineStaleAgentInvocation || !tx.quarantineStaleBackgroundTask) {
    throw new Error(
      "quarantineStaleQueuedResources requires the stale-resource quarantine data layer " +
        "(loadStaleQueuedResources + quarantineStaleAgentInvocation + quarantineStaleBackgroundTask)"
    )
  }
  const stale = await tx.loadStaleQueuedResources()
  const agentInvocations: QuarantineClassOutcome = { listed: stale.agentInvocations.length, updated: 0, skippedRaced: 0 }
  for (const target of stale.agentInvocations) {
    const updated = await tx.quarantineStaleAgentInvocation(target.id)
    if (updated > 0) agentInvocations.updated += 1
    else agentInvocations.skippedRaced += 1
  }
  const backgroundTasks: QuarantineClassOutcome = { listed: stale.backgroundTasks.length, updated: 0, skippedRaced: 0 }
  for (const target of stale.backgroundTasks) {
    const updated = await tx.quarantineStaleBackgroundTask(target.id)
    if (updated > 0) backgroundTasks.updated += 1
    else backgroundTasks.skippedRaced += 1
  }
  return { agentInvocations, backgroundTasks }
}
