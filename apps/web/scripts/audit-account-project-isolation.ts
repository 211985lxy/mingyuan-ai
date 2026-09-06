/**
 * Conservative project-isolation audit / backfill CLI (Task 5).
 *
 * Default is READ-ONLY (dry-run). Run:
 *   pnpm --dir apps/web account:isolation-audit
 *   pnpm --dir apps/web account:isolation-audit -- --apply --report-id <id>
 *
 * `--apply` must reference the report id printed by the most recent dry-run.
 * The engine re-verifies every row inside a transaction and only sets
 * `projectId` on rows that are STILL classified `safe_to_backfill` with the
 * same candidate project; `manual_review` and `conflict` rows are never
 * touched, and rows whose evidence changed since the report are skipped.
 *
 * The audit report is content-free: counts, record ids, candidate project ids,
 * evidence types and conflict reasons only. No body/chat/knowledge text is
 * ever printed or persisted.
 *
 * Mirrors scripts/backfill-account-project-bindings.ts client construction.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import path from "node:path"
import os from "node:os"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

import {
  DEFAULT_REPORT_TTL_MS,
  runIsolationAuditCli,
  type ApplyTarget,
  type ContentGenerationRunCandidateRow,
  type CompetitorAnalysisCandidateRow,
  type IsolationAuditReport,
  type IsolationAuditSnapshot,
  type IsolationAuditStore,
  type IsolationAuditTx,
  type ScriptCandidateRow,
  type StaleQueuedResources,
  type StaleQueuedResourceTarget,
  type VideoCopyExtractionCandidateRow,
  type WatchAccountCandidateRow,
} from "../src/lib/account-project-isolation-audit"
import { cancelStaleProjectBackgroundTask } from "../src/lib/background-tasks"
import { failStaleProjectAgentInvocation } from "../src/lib/aim-remote/invocation-service"

type QueryClient = Pick<
  PrismaClient,
  | "script"
  | "contentGenerationRun"
  | "videoCopyExtraction"
  | "competitorAnalysis"
  | "watchAccount"
  | "inspiration"
  | "benchmarkProfile"
  | "topicSelection"
  | "backgroundTask"
  | "agentInvocation"
  | "user"
>

function createPrismaClient(): PrismaClient {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 5,
    }),
  })
}

/** Directory holding generated (content-free) audit reports so `--apply --report-id` can load them. */
function reportDir(): string {
  return path.join(os.tmpdir(), "aim-account-project-isolation-audit")
}

function saveReport(report: IsolationAuditReport): string {
  const dir = reportDir()
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${report.reportId}.json`)
  writeFileSync(file, JSON.stringify(report), "utf8")
  return file
}

function loadReport(reportId: string): IsolationAuditReport {
  const file = path.join(reportDir(), `${reportId}.json`)
  if (!existsSync(file)) {
    throw new Error(
      `report ${reportId} was not found in ${reportDir()}. A --apply run must reference the CURRENT run's freshly generated report; re-run the audit (dry-run) and pass its report id.`
    )
  }
  return JSON.parse(readFileSync(file, "utf8")) as IsolationAuditReport
}

/* ------------------------------------------------------------------ */
/* Read-only snapshot queries                                          */
/* ------------------------------------------------------------------ */

async function loadAuditSnapshot(client: QueryClient): Promise<IsolationAuditSnapshot> {
  const [scriptRows, runRows, vidRows, cmpRows, waRows] = await Promise.all([
    client.script.findMany({
      where: { projectId: null },
      select: { id: true, userId: true, updatedAt: true, generationRunId: true, topicSelectionId: true },
    }),
    client.contentGenerationRun.findMany({
      where: { projectId: null },
      select: { id: true, userId: true, updatedAt: true, topicSelectionId: true },
    }),
    client.videoCopyExtraction.findMany({
      where: { projectId: null },
      select: { id: true, userId: true, updatedAt: true },
    }),
    client.competitorAnalysis.findMany({
      where: { projectId: null },
      select: { id: true, userId: true, updatedAt: true },
    }),
    client.watchAccount.findMany({
      where: { projectId: null },
      select: { id: true, userId: true, updatedAt: true },
    }),
  ])

  const scriptRunIds = [...new Set(scriptRows.map((r) => r.generationRunId).filter((x): x is string => !!x))]
  const scriptTopicIds = [...new Set(scriptRows.map((r) => r.topicSelectionId).filter((x): x is string => !!x))]
  const runTopicIds = [...new Set(runRows.map((r) => r.topicSelectionId).filter((x): x is string => !!x))]
  const topicIds = [...new Set([...scriptTopicIds, ...runTopicIds])]
  const vidCandidateIds = vidRows.map((r) => r.id)
  const cmpCandidateIds = cmpRows.map((r) => r.id)
  const runCandidateIds = runRows.map((r) => r.id)

  const [referencedRuns, referencedTopics, childScripts, referencingInspirations, referencingBenchmarks] =
    await Promise.all([
      scriptRunIds.length > 0
        ? client.contentGenerationRun.findMany({
            where: { id: { in: scriptRunIds } },
            select: { id: true, userId: true, projectId: true },
          })
        : Promise.resolve([]),
      topicIds.length > 0
        ? client.topicSelection.findMany({
            where: { id: { in: topicIds } },
            select: { id: true, userId: true, projectId: true },
          })
        : Promise.resolve([]),
      runCandidateIds.length > 0
        ? client.script.findMany({
            where: { generationRunId: { in: runCandidateIds }, projectId: { not: null } },
            select: { id: true, userId: true, generationRunId: true, projectId: true },
          })
        : Promise.resolve([]),
      vidCandidateIds.length > 0
        ? client.inspiration.findMany({
            where: { videoCopyExtractionId: { in: vidCandidateIds } },
            select: { id: true, userId: true, projectId: true, videoCopyExtractionId: true },
          })
        : Promise.resolve([]),
      cmpCandidateIds.length > 0
        ? client.benchmarkProfile.findMany({
            where: { competitorAnalysisId: { in: cmpCandidateIds } },
            select: { id: true, userId: true, projectId: true, competitorAnalysisId: true },
          })
        : Promise.resolve([]),
    ])

  const runRefById = new Map(referencedRuns.map((r) => [r.id, { userId: r.userId, projectId: r.projectId }]))
  const topicRefById = new Map(
    referencedTopics.map((t) => [t.id, { userId: t.userId, projectId: t.projectId }])
  )

  const scripts: ScriptCandidateRow[] = scriptRows.map((r) => {
    const runRef = r.generationRunId ? runRefById.get(r.generationRunId) : undefined
    const topicRef = r.topicSelectionId ? topicRefById.get(r.topicSelectionId) : undefined
    return {
      id: r.id,
      userId: r.userId,
      projectId: null,
      updatedAt: r.updatedAt.toISOString(),
      // Same-account references only: a cross-account pointer is never provable evidence.
      generationRunProjectId: runRef && runRef.userId === r.userId ? runRef.projectId : null,
      topicSelectionProjectId: topicRef && topicRef.userId === r.userId ? topicRef.projectId : null,
    }
  })

  const scriptsByRunId = new Map<string, Array<{ userId: string; projectId: string }>>()
  for (const s of childScripts) {
    if (!s.generationRunId || !s.projectId) continue
    const list = scriptsByRunId.get(s.generationRunId) ?? []
    list.push({ userId: s.userId, projectId: s.projectId })
    scriptsByRunId.set(s.generationRunId, list)
  }

  const contentGenerationRuns: ContentGenerationRunCandidateRow[] = runRows.map((r) => {
    const topicRef = r.topicSelectionId ? topicRefById.get(r.topicSelectionId) : undefined
    return {
      id: r.id,
      userId: r.userId,
      projectId: null,
      updatedAt: r.updatedAt.toISOString(),
      // IpProfile has no projectId in the current schema; nothing to contribute.
      topicSelectionProjectId: topicRef && topicRef.userId === r.userId ? topicRef.projectId : null,
      childScriptProjectIds: (scriptsByRunId.get(r.id) ?? [])
        .filter((entry) => entry.userId === r.userId)
        .map((entry) => entry.projectId),
    }
  })

  const inspirationByExtractionId = new Map<string, Array<{ userId: string; projectId: string }>>()
  for (const insp of referencingInspirations) {
    if (!insp.projectId) continue
    const list = inspirationByExtractionId.get(insp.videoCopyExtractionId ?? "") ?? []
    list.push({ userId: insp.userId, projectId: insp.projectId })
    inspirationByExtractionId.set(insp.videoCopyExtractionId ?? "", list)
  }
  const videoCopyExtractions: VideoCopyExtractionCandidateRow[] = vidRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    projectId: null,
    updatedAt: r.updatedAt.toISOString(),
    // Same-account referencing Inspirations only.
    referencingInspirationProjectIds: (inspirationByExtractionId.get(r.id) ?? [])
      .filter((entry) => entry.userId === r.userId)
      .map((entry) => entry.projectId),
  }))

  const benchmarkByAnalysisId = new Map<string, Array<{ userId: string; projectId: string }>>()
  for (const b of referencingBenchmarks) {
    if (!b.projectId) continue
    const list = benchmarkByAnalysisId.get(b.competitorAnalysisId ?? "") ?? []
    list.push({ userId: b.userId, projectId: b.projectId })
    benchmarkByAnalysisId.set(b.competitorAnalysisId ?? "", list)
  }
  const competitorAnalyses: CompetitorAnalysisCandidateRow[] = cmpRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    projectId: null,
    updatedAt: r.updatedAt.toISOString(),
    referencingBenchmarkProfileProjectIds: (benchmarkByAnalysisId.get(r.id) ?? [])
      .filter((entry) => entry.userId === r.userId)
      .map((entry) => entry.projectId),
  }))

  const watchAccounts: WatchAccountCandidateRow[] = waRows.map((r) => ({
    id: r.id,
    userId: r.userId,
    projectId: null,
    updatedAt: r.updatedAt.toISOString(),
  }))

  return {
    scripts,
    contentGenerationRuns,
    videoCopyExtractions,
    competitorAnalyses,
    watchAccounts,
    crossProjectReferenceCount: await countCrossProjectReferences(client),
    queuedBackgroundTaskCount: await client.backgroundTask.count({ where: { status: "queued" } }),
    queuedAgentInvocationCount: await client.agentInvocation.count({ where: { status: "queued" } }),
  }
}

/**
 * Rows that are already project-scoped but whose stored project contradicts a
 * referenced record's project (the "cross-project reference" leak signal).
 * Each mismatching row counts once; only ids/project ids are compared.
 */
async function countCrossProjectReferences(client: QueryClient): Promise<number> {
  let count = 0

  // Script rows whose own project differs from their generation run's project.
  const [scopedScripts, scopedRuns, scopedTopics] = await Promise.all([
    client.script.findMany({
      where: { projectId: { not: null }, generationRunId: { not: null } },
      select: { id: true, projectId: true, generationRunId: true },
    }),
    client.contentGenerationRun.findMany({
      where: { projectId: { not: null } },
      select: { id: true, projectId: true, topicSelectionId: true },
    }),
    client.topicSelection.findMany({ where: { projectId: { not: null } }, select: { id: true, projectId: true } }),
  ])
  const runProjectById = new Map(scopedRuns.map((r) => [r.id, r.projectId]))
  for (const s of scopedScripts) {
    const runProject = s.generationRunId ? runProjectById.get(s.generationRunId) : undefined
    if (runProject !== undefined && s.projectId !== runProject) count += 1
  }
  const topicProjectById = new Map(scopedTopics.map((t) => [t.id, t.projectId]))
  for (const r of scopedRuns) {
    const topicProject = r.topicSelectionId ? topicProjectById.get(r.topicSelectionId) : undefined
    if (topicProject !== undefined && r.projectId !== topicProject) count += 1
  }

  // Inspirations whose project differs from the VideoCopyExtraction they reference.
  const [scopedInspirations, scopedExtractions] = await Promise.all([
    client.inspiration.findMany({
      where: { videoCopyExtractionId: { not: null }, projectId: { not: null } },
      select: { id: true, projectId: true, videoCopyExtractionId: true },
    }),
    client.videoCopyExtraction.findMany({
      where: { projectId: { not: null } },
      select: { id: true, projectId: true },
    }),
  ])
  const extractionProjectById = new Map(scopedExtractions.map((v) => [v.id, v.projectId]))
  for (const insp of scopedInspirations) {
    const target = insp.videoCopyExtractionId ? extractionProjectById.get(insp.videoCopyExtractionId) : undefined
    if (target !== undefined && insp.projectId !== target) count += 1
  }

  // BenchmarkProfiles whose project differs from the CompetitorAnalysis they reference.
  const [scopedBenchmarks, scopedAnalyses] = await Promise.all([
    client.benchmarkProfile.findMany({
      where: { competitorAnalysisId: { not: null } },
      select: { id: true, projectId: true, competitorAnalysisId: true },
    }),
    client.competitorAnalysis.findMany({
      where: { projectId: { not: null } },
      select: { id: true, projectId: true },
    }),
  ])
  const analysisProjectById = new Map(scopedAnalyses.map((a) => [a.id, a.projectId]))
  for (const b of scopedBenchmarks) {
    const target = b.competitorAnalysisId ? analysisProjectById.get(b.competitorAnalysisId) : undefined
    if (target !== undefined && b.projectId !== target) count += 1
  }

  return count
}

/* ------------------------------------------------------------------ */
/* Store + conditional apply writes                                    */
/* ------------------------------------------------------------------ */

/** AgentInvocation statuses that are still pending/in-flight (never completed). */
const ACTIVE_INVOCATION_STATUSES = ["queued", "running"]
/** BackgroundTask statuses that are still pending/in-flight (never completed). */
const ACTIVE_TASK_STATUSES = ["queued", "leased", "retry_wait"]

/**
 * Task 6 quarantine: list queued/pending/in-flight resources whose project no
 * longer matches the owning account's CURRENT binding.
 *
 * - AgentInvocation rows carry their own projectId; a queued/running invocation
 *   is stale when the account is currently bound to a different project.
 * - BackgroundTask rows carry no project column; the only provable project link
 *   the audit data layer has is the agent-invocation two-resource pair created
 *   by submitInvocation (aggregateType "agent_invocation" -> AgentInvocation).
 *   Such a task is stale exactly when its invocation is stale. The other worker
 *   task kinds are project-scoped through their own aggregates and are already
 *   stopped by the Task-1 execution gate when they are claimed.
 * - Completed history (succeeded/failed/cancelled) is never listed.
 *
 * Only ids are returned — reports/logs stay content-free.
 */
async function listStaleQueuedResources(client: QueryClient): Promise<StaleQueuedResources> {
  const [pendingInvocations, pendingInvocationTasks] = await Promise.all([
    client.agentInvocation.findMany({
      where: { status: { in: ACTIVE_INVOCATION_STATUSES } },
      select: { id: true, userId: true, projectId: true },
    }),
    client.backgroundTask.findMany({
      where: { status: { in: ACTIVE_TASK_STATUSES }, aggregateType: "agent_invocation" },
      select: { id: true, aggregateId: true },
    }),
  ])
  if (pendingInvocations.length === 0 && pendingInvocationTasks.length === 0) {
    return { agentInvocations: [], backgroundTasks: [] }
  }
  const userIds = [...new Set(pendingInvocations.map((inv) => inv.userId))]
  const boundUsers = await client.user.findMany({
    where: { id: { in: userIds } },
    select: { id: true, boundProjectId: true },
  })
  const boundProjectByUserId = new Map(boundUsers.map((u) => [u.id, u.boundProjectId]))
  const staleInvocationIds = new Set<string>()
  const agentInvocations: StaleQueuedResourceTarget[] = []
  for (const invocation of pendingInvocations) {
    const boundProjectId = boundProjectByUserId.get(invocation.userId)
    // Only accounts that ARE bound count: a queued resource whose project no
    // longer matches the account's current binding is stale.
    if (boundProjectId != null && boundProjectId !== invocation.projectId) {
      staleInvocationIds.add(invocation.id)
      agentInvocations.push({ id: invocation.id })
    }
  }
  const backgroundTasks: StaleQueuedResourceTarget[] = pendingInvocationTasks
    .filter((task) => task.aggregateId !== null && staleInvocationIds.has(task.aggregateId))
    .map((task) => ({ id: task.id }))
  return { agentInvocations, backgroundTasks }
}

async function setProjectIdIfNull(client: QueryClient, target: ApplyTarget): Promise<number> {
  // Conditional update: only matches while the row still has projectId = null, so a concurrent
  // writer can never be overwritten and scope is never widened.
  switch (target.model) {
    case "Script":
      return (await client.script.updateMany({ where: { id: target.id, projectId: null }, data: { projectId: target.candidateProjectId } })).count
    case "ContentGenerationRun":
      return (
        await client.contentGenerationRun.updateMany({ where: { id: target.id, projectId: null }, data: { projectId: target.candidateProjectId } })
      ).count
    case "VideoCopyExtraction":
      return (
        await client.videoCopyExtraction.updateMany({ where: { id: target.id, projectId: null }, data: { projectId: target.candidateProjectId } })
      ).count
    case "CompetitorAnalysis":
      return (
        await client.competitorAnalysis.updateMany({ where: { id: target.id, projectId: null }, data: { projectId: target.candidateProjectId } })
      ).count
    case "WatchAccount":
      // No supported evidence source: never planned for backfill.
      return 0
  }
}

function makeStore(prisma: PrismaClient): IsolationAuditStore {
  const txFor = (client: QueryClient): IsolationAuditTx => ({
    loadSnapshot: () => loadAuditSnapshot(client),
    setProjectId: (target) => setProjectIdIfNull(client, target),
    // Task 6 quarantine extension: stale queued/in-flight resources are listed
    // and quarantined inside the SAME transaction as the schema writes.
    loadStaleQueuedResources: () => listStaleQueuedResources(client),
    quarantineStaleAgentInvocation: (id) => failStaleProjectAgentInvocation(client as PrismaClient, id),
    quarantineStaleBackgroundTask: (id) => cancelStaleProjectBackgroundTask(client as PrismaClient, id),
  })
  return {
    loadSnapshot: () => loadAuditSnapshot(prisma),
    withTransaction: <T,>(work: (handle: IsolationAuditTx) => Promise<T>): Promise<T> =>
      prisma.$transaction((client) => work(txFor(client as QueryClient))),
  }
}

/* ------------------------------------------------------------------ */
/* Output (content-free)                                               */
/* ------------------------------------------------------------------ */

function printReport(report: IsolationAuditReport): void {
  const { perModel, total } = report
  console.log("=== Project isolation audit (content-free) ===")
  for (const model of ["Script", "ContentGenerationRun", "VideoCopyExtraction", "CompetitorAnalysis", "WatchAccount"] as const) {
    const c = perModel[model]
    console.log(
      `${model}: nullProjectRows=${c.nullProjectRows} safe_to_backfill=${c.safeToBackfill} manual_review=${c.manualReview} conflict=${c.conflict}`
    )
  }
  console.log(
    `total: nullProjectRows=${total.nullProjectRows} safe_to_backfill=${total.safeToBackfill} manual_review=${total.manualReview} conflict=${total.conflict}`
  )
  console.log(`crossProjectReferenceCount=${report.crossProjectReferenceCount}`)
  console.log(`queuedBackgroundTaskCount=${report.queuedBackgroundTaskCount}`)
  console.log(`queuedAgentInvocationCount=${report.queuedAgentInvocationCount}`)
  console.log(`zeroConflicts=${report.zeroConflicts}`)
  console.log(`reportId=${report.reportId}`)
  console.log(`generatedAtMs=${report.generatedAtMs} expiresAtMs=${report.expiresAtMs}`)
}

function printRows(report: IsolationAuditReport): void {
  for (const row of report.safeToBackfillRows) {
    console.log(`safe  ${row.model} ${row.id} -> project ${row.candidateProjectId} (evidence: ${row.evidenceTypes.join(",")})`)
  }
  for (const row of report.manualReviewRows) {
    console.log(`review ${row.model} ${row.id}`)
  }
  for (const row of report.conflictRows) {
    console.log(`conflict ${row.model} ${row.id} candidates=${row.candidateProjectIds.join(",")} reason=${row.conflictReason}`)
  }
}

/* ------------------------------------------------------------------ */

function parseArgs(argv: string[]): { apply: boolean; reportId: string | null } {
  const apply = argv.includes("--apply")
  const reportFlagIndex = argv.indexOf("--report-id")
  const reportId = reportFlagIndex >= 0 ? (argv[reportFlagIndex + 1] ?? null) : null
  if (apply && !reportId) {
    throw new Error(
      "usage: account:isolation-audit [-- --apply --report-id <id>]\n" +
        "--apply requires the report id printed by the current audit run (dry-run)."
    )
  }
  return { apply, reportId }
}

async function main(): Promise<void> {
  const { apply, reportId } = parseArgs(process.argv.slice(2))
  const prisma = createPrismaClient()
  try {
    const store = makeStore(prisma)
    if (apply) {
      const report = loadReport(reportId as string)
      const result = await runIsolationAuditCli({
        store,
        apply: true,
        report,
        reportTtlMs: DEFAULT_REPORT_TTL_MS,
        quarantineStaleQueuedResources: true,
      })
      printReport(result.report)
      if (result.validation && !result.validation.ok) {
        console.error(`[apply rejected] ${result.validation.reason}`)
        return
      }
      console.log(
        `[apply] applied=${result.appliedCount} skipped_raced=${result.skippedRacedCount} ` +
          `skipped_changed=${(result.plan?.skippedChanged ?? []).length}`
      )
      for (const w of result.writes) {
        console.log(`write ${w.status} ${w.model} ${w.id} -> project ${w.projectId}`)
      }
      for (const skipped of result.plan?.skippedChanged ?? []) {
        console.log(`skip ${skipped.model} ${skipped.id} reason=${skipped.reason}`)
      }
      if (result.quarantine) {
        const inv = result.quarantine.agentInvocations
        const task = result.quarantine.backgroundTasks
        console.log(
          `[quarantine] AgentInvocation listed=${inv.listed} updated=${inv.updated} skipped_raced=${inv.skippedRaced} (failed ACCOUNT_PROJECT_CONTEXT_STALE)`
        )
        console.log(
          `[quarantine] BackgroundTask listed=${task.listed} updated=${task.updated} skipped_raced=${task.skippedRaced} (cancelled ACCOUNT_PROJECT_CONTEXT_STALE)`
        )
      }
      return
    }

    // dry-run: read-only.
    const result = await runIsolationAuditCli({ store, apply: false, reportTtlMs: DEFAULT_REPORT_TTL_MS })
    const file = saveReport(result.report)
    printReport(result.report)
    printRows(result.report)
    console.log(`[dry-run] no writes were performed. Report saved to ${file}`)
    // --apply would be rejected for a report with conflicts, so only advertise it
    // when the audit is actually applicable.
    if (result.report.zeroConflicts) {
      console.log("To backfill, review the report, then run:")
      console.log("  pnpm --dir apps/web account:isolation-audit -- --apply --report-id " + result.report.reportId)
    } else {
      console.log("Report has conflicts/manual-review rows that block --apply; resolve ownership first, then re-run the audit.")
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("account project isolation audit failed:", error instanceof Error ? error.message : error)
  process.exitCode = 1
})
