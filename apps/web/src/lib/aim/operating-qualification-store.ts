import { evaluateLearningQualification } from "@/lib/aim/learning-candidate"
import {
  evaluateOperatingQualification,
  selectLatestConsecutiveWeeks,
  type OperatingQualificationEvidence,
  type QualificationWeek,
} from "@/lib/aim/operating-qualification"
import { loadGovernedActions } from "@/lib/aim/operating-qualification-actions"
import { WEEKLY_OUTCOME_WINDOW_POLICY } from "@/lib/aim/weekly-review"
import { prisma } from "@/lib/prisma"

const CYCLE_LIMIT = 24
const LEARNING_LIMIT = 1_000

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function rate(snapshot: unknown, key: string): number | null {
  const value = object(snapshot)?.[key]
  return typeof value === "number"
    && Number.isFinite(value)
    && value >= 0
    && value <= 1
    ? value
    : null
}

async function loadQualificationCycles(): Promise<QualificationWeek[]> {
  const rows = await prisma.reviewCycle.findMany({
    where: { status: "signed" },
    orderBy: [{ periodEnd: "desc" }, { signedAt: "desc" }],
    take: CYCLE_LIMIT,
    select: {
      id: true,
      status: true,
      periodStart: true,
      periodEnd: true,
      signedAt: true,
      signedApprovalId: true,
      metricsSnapshot: true,
    },
  })
  return rows.map((row) => ({
    ...row,
    runIdCoverage: rate(row.metricsSnapshot, "runIdCoverage"),
    costCoverage: rate(row.metricsSnapshot, "costCoverage"),
    finalDispositionCoverage: rate(
      row.metricsSnapshot,
      "finalDispositionCoverage",
    ),
    generationLinkCoverage: rate(
      row.metricsSnapshot,
      "generationLinkCoverage",
    ),
    day7BackfillRate: rate(row.metricsSnapshot, "day7BackfillRate"),
  }))
}

function parseQualificationMetrics(value: unknown) {
  const row = object(value)
  if (!row) return null
  const keys = [
    "targetFailureRateBefore",
    "targetFailureRateAfter",
    "acceptanceRateBefore",
    "acceptanceRateAfter",
    "evidenceCompletenessRateBefore",
    "evidenceCompletenessRateAfter",
    "severeHallucinationRate",
  ] as const
  if (!keys.every((key) => typeof row[key] === "number")) return null
  return Object.fromEntries(keys.map((key) => [key, row[key]])) as {
    [K in (typeof keys)[number]]: number
  }
}

async function loadQualifiedLearningLoops(approvedFormalRefs: Set<string>) {
  const candidates = await prisma.learningCandidate.findMany({
    where: { reviewStatus: "promoted", failureCode: { not: null } },
    include: { evalFixtureVersion: true },
    orderBy: { updatedAt: "desc" },
    take: LEARNING_LIMIT,
  })
  const methodologyIds = candidates.flatMap((candidate) =>
    candidate.targetType === "methodology_revision"
    && candidate.promotedRef?.startsWith("methodology_version:")
      ? [candidate.promotedRef.slice("methodology_version:".length)]
      : [])
  const published = methodologyIds.length
    ? await prisma.methodologyProfileVersion.findMany({
      where: { id: { in: methodologyIds }, status: "published" },
      take: LEARNING_LIMIT,
      select: { id: true },
    })
    : []
  const publishedIds = new Set(published.map((row) => row.id))
  const methodologySources = new Set(candidates.flatMap((candidate) => {
    const versionId = candidate.promotedRef?.startsWith("methodology_version:")
      ? candidate.promotedRef.slice("methodology_version:".length)
      : null
    return candidate.targetType === "methodology_revision"
      && versionId
      && publishedIds.has(versionId)
      && approvedFormalRefs.has(`formal_methodology.publish:${versionId}`)
      ? [`${candidate.sourceType}:${candidate.sourceId}`]
      : []
  }))
  const refs: string[] = []
  for (const candidate of candidates) {
    const version = candidate.evalFixtureVersion
    const metrics = parseQualificationMetrics(version?.qualificationMetrics)
    const source = `${candidate.sourceType}:${candidate.sourceId}`
    if (
      candidate.targetType !== "eval_fixture"
      || version?.status !== "active"
      || !approvedFormalRefs.has(`formal_eval.activate:${version?.id}`)
      || !metrics
      || !methodologySources.has(source)
    ) continue
    const gate = evaluateLearningQualification({
      deterministicPassed: Boolean(version.deterministicPassedAt),
      dailyPassed: Boolean(version.dailyPassedAt),
      evidenceRef: version.qualificationEvidenceRef ?? "",
      metrics,
    })
    if (gate.ok) refs.push(`learning_source:${source}`)
  }
  return [...new Set(refs)]
}

async function loadOperatingSample() {
  const [
    publishedContentCount,
    realProjects,
    approvedCustomerOutcomeCount,
    fullAttributionChainCount,
  ] = await Promise.all([
    prisma.aimGeneration.count({
      where: { workflowStatus: "published", publishedAt: { not: null } },
    }),
    prisma.aimGeneration.findMany({
      where: {
        workflowStatus: "published",
        publishedAt: { not: null },
        projectId: { not: null },
      },
      distinct: ["projectId"],
      take: 11,
      select: { projectId: true },
    }),
    prisma.customerOutcomeProjection.count({
      where: {
        reviewStatus: "approved",
        baseline: { not: null },
        actual: { not: null },
        reviewerRef: { not: null },
        evidenceRef: { not: "" },
      },
    }),
    prisma.outcomeAttribution.count({
      where: {
        externalLeadId: { not: "" },
        externalAppointmentId: { not: "" },
        externalDealId: { not: "" },
        externalPaymentId: { not: "" },
        attributionMethod: { in: ["explicit", "first_touch"] },
      },
    }),
  ])
  return {
    publishedContentCount,
    realProjectCount: realProjects.length,
    approvedCustomerOutcomeCount,
    fullAttributionChainCount,
  }
}

export async function loadOperatingQualificationEvidence(
  evaluatedAt = new Date(),
): Promise<OperatingQualificationEvidence> {
  const cycles = await loadQualificationCycles()
  const weeks = selectLatestConsecutiveWeeks(cycles)
  const [assignments, actions, sample] = await Promise.all([
    prisma.governanceAssignment.findMany({
      where: { status: "active" },
      take: 200,
      select: {
        id: true,
        scopeType: true,
        scopeId: true,
        role: true,
        status: true,
        effectiveAt: true,
        userId: true,
        externalOpenId: true,
        externalUserId: true,
      },
    }),
    loadGovernedActions(weeks),
    loadOperatingSample(),
  ])
  const approvedFormalRefs = new Set(actions.formalWrites
    .filter((row) => row.approvalBacked)
    .map((row) => `${row.type}:${row.id}`))
  const learningLoopRefs = await loadQualifiedLearningLoops(approvedFormalRefs)
  return {
    evaluatedAt,
    cycles,
    assignments: assignments.map((row) => ({
      id: row.id,
      scopeType: row.scopeType,
      scopeId: row.scopeId,
      role: row.role,
      status: row.status,
      effectiveAt: row.effectiveAt,
      hasIdentity: Boolean(
        row.userId || row.externalOpenId || row.externalUserId,
      ),
    })),
    ...actions,
    ...sample,
    outcomeWindowPolicy: WEEKLY_OUTCOME_WINDOW_POLICY,
    qualifiedLearningLoopCount: learningLoopRefs.length,
    learningLoopRefs,
  }
}

export async function getOperatingQualification() {
  return evaluateOperatingQualification(
    await loadOperatingQualificationEvidence(),
  )
}
