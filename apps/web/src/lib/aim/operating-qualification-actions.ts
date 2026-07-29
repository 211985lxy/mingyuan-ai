import type {
  GovernedActionEvidence,
  QualificationWeek,
} from "@/lib/aim/operating-qualification"
import {
  expectedQualificationAuditSubject,
  hasQualificationMethodologyDualSign,
  qualificationApprovalId,
  type QualificationApprovalRow,
  validQualificationApproval,
} from "@/lib/aim/operating-qualification-approvals"
import { prisma } from "@/lib/prisma"

const ROW_LIMIT = 2_000
const APPROVAL_LIMIT = 10_000
const HIGH_RISK_AUDIT_ACTIONS = [
  "methodology.update",
  "methodology.reset",
  "methodology_profile.update",
  "methodology_profile_version.publish",
  "learning_candidate.approve",
  "learning_candidate.reject",
  "learning_candidate.promote_eval",
  "learning_candidate.promote_methodology",
  "learning_candidate.qualify_eval",
  "learning_candidate.activate_eval",
] as const

interface ActionRows {
  audits: Array<{
    id: string
    action: string
    targetId: string | null
    metadata: unknown
    createdAt: Date
  }>
  assets: Array<{ id: string; updatedAt: Date }>
  memories: Array<{ id: string; reviewedAt: Date | null }>
  evals: Array<{
    id: string
    sourceCandidateId: string
    activationApprovalId: string | null
    activatedAt: Date | null
  }>
  methodologyVersions: Array<{ id: string; publishedAt: Date | null }>
}

async function loadActionRows(start: Date, end: Date): Promise<ActionRows> {
  const [audits, assets, memories, evals, methodologyVersions] = await Promise.all([
    prisma.adminAuditLog.findMany({
      where: {
        action: { in: [...HIGH_RISK_AUDIT_ACTIONS] },
        createdAt: { gte: start, lt: end },
      },
      orderBy: { createdAt: "asc" },
      take: ROW_LIMIT + 1,
      select: {
        id: true,
        action: true,
        targetId: true,
        metadata: true,
        createdAt: true,
      },
    }),
    prisma.assetCandidate.findMany({
      where: {
        promotedEntryId: { not: null },
        updatedAt: { gte: start, lt: end },
      },
      take: ROW_LIMIT + 1,
      select: { id: true, updatedAt: true },
    }),
    prisma.aimMemory.findMany({
      where: {
        status: "active",
        reviewedAt: { gte: start, lt: end },
      },
      take: ROW_LIMIT + 1,
      select: { id: true, reviewedAt: true },
    }),
    prisma.evalFixtureVersion.findMany({
      where: { status: "active", activatedAt: { gte: start, lt: end } },
      take: ROW_LIMIT + 1,
      select: {
        id: true,
        sourceCandidateId: true,
        activationApprovalId: true,
        activatedAt: true,
      },
    }),
    prisma.methodologyProfileVersion.findMany({
      where: {
        status: "published",
        publishedAt: { gte: start, lt: end },
      },
      take: ROW_LIMIT + 1,
      select: { id: true, publishedAt: true },
    }),
  ])
  const result = { audits, assets, memories, evals, methodologyVersions }
  if (Object.values(result).some((rows) => rows.length > ROW_LIMIT)) {
    throw new Error("经营资格动作证据超过 2000 条，拒绝给出不完整结论")
  }
  return result
}

function approvalFilters(weeks: QualificationWeek[], rows: ActionRows) {
  const directIds = [
    ...weeks.flatMap((row) =>
      row.signedApprovalId ? [row.signedApprovalId] : []),
    ...rows.audits.flatMap((row) => {
      const id = qualificationApprovalId(row.metadata)
      return id ? [id] : []
    }),
    ...rows.evals.flatMap((row) =>
      row.activationApprovalId ? [row.activationApprovalId] : []),
  ]
  const methodologyIds = rows.audits.flatMap((row) => {
    const expected = expectedQualificationAuditSubject(
      row.action,
      row.targetId,
      row.metadata,
    )
    return expected?.type === "methodology" ? [expected.id] : []
  })
  return [
    ...(directIds.length ? [{ id: { in: directIds } }] : []),
    ...(methodologyIds.length ? [{
      subjectType: "methodology",
      subjectId: { in: methodologyIds },
    }] : []),
    ...(rows.assets.length ? [{
      subjectType: "asset",
      subjectId: { in: rows.assets.map((row) => row.id) },
    }] : []),
    ...(rows.memories.length ? [{
      subjectType: "memory",
      subjectId: { in: rows.memories.map((row) => row.id) },
    }] : []),
    ...(rows.evals.length ? [{
      subjectType: "learning_candidate",
      subjectId: { in: rows.evals.map((row) => row.sourceCandidateId) },
    }] : []),
  ]
}

async function loadApprovals(
  weeks: QualificationWeek[],
  rows: ActionRows,
): Promise<QualificationApprovalRow[]> {
  const OR = approvalFilters(weeks, rows)
  if (!OR.length) return []
  return prisma.approvalDecision.findMany({
    where: { OR },
    take: APPROVAL_LIMIT,
    select: {
      id: true,
      subjectType: true,
      subjectId: true,
      decision: true,
      roleSnapshot: true,
      workflowId: true,
      reviewerUserId: true,
      externalReviewerId: true,
      externalReviewerUserId: true,
      decidedAt: true,
    },
  })
}

function buildCycleActions(
  weeks: QualificationWeek[],
  byId: Map<string, QualificationApprovalRow>,
): GovernedActionEvidence[] {
  return weeks.map((row) => {
    const occurredAt = row.signedAt ?? row.periodEnd
    return {
      id: row.id,
      type: "review_cycle.sign",
      occurredAt,
      approvalBacked: validQualificationApproval(
        row.signedApprovalId ? byId.get(row.signedApprovalId) : undefined,
        occurredAt,
        { type: "review_cycle", id: row.id },
      ),
    }
  })
}

function buildAuditActions(
  rows: ActionRows["audits"],
  approvals: QualificationApprovalRow[],
  byId: Map<string, QualificationApprovalRow>,
): GovernedActionEvidence[] {
  return rows.map((row) => {
    const id = qualificationApprovalId(row.metadata)
    const expected = expectedQualificationAuditSubject(
      row.action,
      row.targetId,
      row.metadata,
    )
    const direct = id ? byId.get(id) : undefined
    const expectedDecision =
      row.action === "learning_candidate.reject" ? "reject" : "approve"
    const approvalBacked = validQualificationApproval(
      direct,
      row.createdAt,
      expected,
      expectedDecision,
    )
      && (expected?.type !== "methodology"
        || hasQualificationMethodologyDualSign(
          approvals,
          expected,
          row.createdAt,
          direct?.workflowId ?? null,
        ))
    return {
      id: row.id,
      type: row.action,
      occurredAt: row.createdAt,
      approvalBacked,
    }
  })
}

function buildCandidateFormalWrites(
  rows: ActionRows,
  byId: Map<string, QualificationApprovalRow>,
  bySubject: Map<string, QualificationApprovalRow>,
): GovernedActionEvidence[] {
  const assets = rows.assets.map((row) => ({
    id: row.id,
    type: "formal_asset.promote",
    occurredAt: row.updatedAt,
    approvalBacked: validQualificationApproval(
      bySubject.get(`asset:${row.id}`),
      row.updatedAt,
      { type: "asset", id: row.id },
    ),
  }))
  const memories = rows.memories.map((row) => {
    const occurredAt = row.reviewedAt ?? new Date(0)
    return {
      id: row.id,
      type: "formal_memory.activate",
      occurredAt,
      approvalBacked: validQualificationApproval(
        bySubject.get(`memory:${row.id}`),
        occurredAt,
        { type: "memory", id: row.id },
      ),
    }
  })
  const evals = rows.evals.map((row) => {
    const occurredAt = row.activatedAt ?? new Date(0)
    return {
      id: row.id,
      type: "formal_eval.activate",
      occurredAt,
      approvalBacked: validQualificationApproval(
        row.activationApprovalId
          ? byId.get(row.activationApprovalId)
          : undefined,
        occurredAt,
        { type: "learning_candidate", id: row.sourceCandidateId },
      ),
    }
  })
  return [...assets, ...memories, ...evals]
}

function buildFormalWrites(
  rows: ActionRows,
  auditActions: GovernedActionEvidence[],
  byId: Map<string, QualificationApprovalRow>,
  bySubject: Map<string, QualificationApprovalRow>,
) {
  const approvedMethodologyTargets = new Set(
    rows.audits.flatMap((row, index) =>
      row.action === "methodology_profile_version.publish"
      && row.targetId
      && auditActions[index]?.approvalBacked
        ? [row.targetId]
        : []),
  )
  const methodology = rows.methodologyVersions.map((row) => ({
    id: row.id,
    type: "formal_methodology.publish",
    occurredAt: row.publishedAt ?? new Date(0),
    approvalBacked: approvedMethodologyTargets.has(row.id),
  }))
  return [
    ...buildCandidateFormalWrites(rows, byId, bySubject),
    ...methodology,
  ]
}

export async function loadGovernedActions(weeks: QualificationWeek[]) {
  const start = weeks.at(0)?.periodStart
  const end = weeks.at(-1)?.periodEnd
  if (!start || !end) {
    return { highRiskActions: [], formalWrites: [] }
  }
  const rows = await loadActionRows(start, end)
  const approvals = await loadApprovals(weeks, rows)
  const byId = new Map(approvals.map((row) => [row.id, row]))
  const bySubject = new Map(
    approvals
      .filter((row) => row.decision === "approve")
      .map((row) => [`${row.subjectType}:${row.subjectId}`, row]),
  )
  const cycleActions = buildCycleActions(weeks, byId)
  const auditActions = buildAuditActions(rows.audits, approvals, byId)
  const formalWrites = buildFormalWrites(
    rows,
    auditActions,
    byId,
    bySubject,
  )
  return {
    highRiskActions: [...cycleActions, ...auditActions, ...formalWrites],
    formalWrites,
  }
}
