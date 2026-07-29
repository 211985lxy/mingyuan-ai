import type { EvalFixture } from "@/lib/aim-harness/eval/contracts"
import type { Prisma } from "@/generated/prisma/client"
import {
  createFrozenContextAdapter,
  runEvalCase,
} from "@/lib/aim-harness/eval-runner"
import {
  evaluateLearningQualification,
  isActivationApprovalAfterQualification,
  transitionLearningReview,
} from "@/lib/aim/learning-candidate"
import { verifyDailyEvalArtifact } from "@/lib/aim/daily-eval-artifact"
import { prisma } from "@/lib/prisma"

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue
}

function parseFixture(value: unknown): EvalFixture | null {
  const row = record(value)
  const input = record(row?.input)
  const seedContext = record(row?.seedContext)
  const expectations = record(row?.expectations)
  if (
    !row
    || typeof row.id !== "string"
    || !row.id.trim()
    || !Number.isInteger(row.version)
    || typeof row.agent !== "string"
    || typeof row.scenario !== "string"
    || typeof row.entrypoint !== "string"
    || !input
    || typeof input.rawInput !== "string"
    || !seedContext
    || !Array.isArray(seedContext.knowledge)
    || !expectations
    || !Array.isArray(expectations.outputFormats)
    || typeof row.description !== "string"
  ) return null
  return row as unknown as EvalFixture
}

export async function annotateLearningCandidate(input: {
  candidateId: string
  annotation: Record<string, unknown>
  reviewerId: string
}) {
  if (!Object.keys(input.annotation).length) {
    throw new Error("annotation 不能为空对象")
  }
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: input.candidateId },
  })
  if (!candidate) throw new Error("学习候选不存在")
  if (candidate.reviewStatus !== "pending") {
    throw new Error("只有 pending 候选可补充人工标注")
  }
  const payload = record(candidate.payload) ?? {}
  return prisma.learningCandidate.update({
    where: { id: candidate.id },
    data: {
      payload: json({ ...payload, annotation: input.annotation }),
      reviewerId: input.reviewerId,
    },
  })
}

export async function decideLearningCandidate(input: {
  candidateId: string
  decision: "approve" | "reject"
  reviewerId: string
}) {
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: input.candidateId },
  })
  if (!candidate) throw new Error("学习候选不存在")
  if (
    (input.decision === "approve" && candidate.reviewStatus === "approved")
    || (input.decision === "reject" && candidate.reviewStatus === "rejected")
  ) return { record: candidate, idempotent: true }
  const transition = transitionLearningReview({
    current: candidate.reviewStatus as never,
    decision: input.decision,
    reviewerId: input.reviewerId,
  })
  if (!transition.ok) throw new Error(transition.reason)
  const updated = await prisma.learningCandidate.updateMany({
    where: { id: candidate.id, reviewStatus: candidate.reviewStatus },
    data: {
      reviewStatus: transition.next,
      reviewerId: transition.reviewerId,
    },
  })
  if (updated.count !== 1) throw new Error("学习候选审批发生并发冲突")
  const record = await prisma.learningCandidate.findUnique({
    where: { id: candidate.id },
  })
  if (!record) throw new Error("学习候选审批后回读失败")
  return { record, idempotent: false }
}

export async function promoteLearningCandidateToEvalDraft(input: {
  candidateId: string
  reviewerId: string
}) {
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: input.candidateId },
    include: { evalFixtureVersion: true },
  })
  if (!candidate) throw new Error("学习候选不存在")
  if (candidate.evalFixtureVersion) {
    return { record: candidate.evalFixtureVersion, idempotent: true }
  }
  if (candidate.reviewStatus !== "approved") throw new Error("只有 approved 候选可晋升")
  if (candidate.targetType !== "eval_fixture") throw new Error("候选目标不是 eval_fixture")
  const payload = record(candidate.payload)
  const annotation = record(payload?.annotation)
  const fixture = parseFixture(annotation?.fixture)
  if (!fixture) throw new Error("人工标注缺少合法 EvalFixture")
  const latest = await prisma.evalFixtureVersion.findFirst({
    where: { fixtureKey: fixture.id },
    orderBy: { version: "desc" },
    select: { version: true },
  })
  const version = (latest?.version ?? 0) + 1
  const created = await prisma.evalFixtureVersion.create({
    data: {
      fixtureKey: fixture.id,
      version,
      sourceCandidateId: candidate.id,
      payload: json({ ...fixture, version }),
      status: "draft",
    },
  })
  await prisma.learningCandidate.update({
    where: { id: candidate.id },
    data: {
      reviewStatus: "promoted",
      reviewerId: input.reviewerId,
      promotedRef: `eval_fixture:${created.id}`,
    },
  })
  return { record: created, idempotent: false }
}

export async function qualifyEvalFixtureVersion(input: {
  versionId: string
  candidateId: string
  dailyEvalArtifact: unknown
}) {
  const version = await prisma.evalFixtureVersion.findUnique({
    where: { id: input.versionId },
  })
  if (!version) throw new Error("Eval fixture 版本不存在")
  if (version.sourceCandidateId !== input.candidateId) {
    throw new Error("Eval 版本不属于该学习候选，拒绝跨候选操作")
  }
  if (version.status !== "draft") throw new Error("只有 draft fixture 可执行灰度资格检查")
  const fixture = parseFixture(version.payload)
  if (!fixture) throw new Error("Eval fixture payload 非法")
  const daily = verifyDailyEvalArtifact({
    artifact: input.dailyEvalArtifact,
  })
  if (!daily.ok) throw new Error(daily.reason)
  const deterministic = await runEvalCase(
    fixture,
    createFrozenContextAdapter(),
    { skipRubric: true },
  )
  const gate = evaluateLearningQualification({
    deterministicPassed: deterministic.contractPassed,
    dailyPassed: true,
    evidenceRef: daily.evidenceRef,
    metrics: daily.metrics,
  })
  if (!gate.ok) throw new Error(gate.reasons.join("；"))
  return prisma.evalFixtureVersion.update({
    where: { id: version.id },
    data: {
      status: "qualified",
      deterministicPassedAt: new Date(),
      dailyPassedAt: daily.passedAt,
      qualificationMetrics: json(daily.metrics),
      qualificationEvidenceRef: daily.evidenceRef,
    },
  })
}

export async function activateEvalFixtureVersion(input: {
  versionId: string
  candidateId: string
  approvalId: string
}) {
  const [version, approval] = await Promise.all([
    prisma.evalFixtureVersion.findUnique({ where: { id: input.versionId } }),
    prisma.approvalDecision.findUnique({ where: { id: input.approvalId } }),
  ])
  if (!version) throw new Error("Eval fixture 版本不存在")
  if (version.sourceCandidateId !== input.candidateId) {
    throw new Error("Eval 版本不属于该学习候选，拒绝跨候选操作")
  }
  if (
    version.status === "active"
    && version.activationApprovalId === input.approvalId
  ) return { record: version, idempotent: true }
  if (version.status !== "qualified") throw new Error("只有 qualified fixture 可激活")
  if (!isActivationApprovalAfterQualification({
    approvalDecidedAt: approval?.decidedAt,
    deterministicPassedAt: version.deterministicPassedAt,
    dailyPassedAt: version.dailyPassedAt,
  })) throw new Error("激活审批必须在 deterministic/daily 资格通过后签署")
  const updated = await prisma.evalFixtureVersion.updateMany({
    where: { id: version.id, status: "qualified", activationApprovalId: null },
    data: {
      status: "active",
      activationApprovalId: input.approvalId,
      activatedAt: new Date(),
    },
  })
  if (updated.count !== 1) throw new Error("Eval fixture 激活发生并发冲突")
  const record = await prisma.evalFixtureVersion.findUnique({
    where: { id: version.id },
  })
  if (!record) throw new Error("Eval fixture 激活后回读失败")
  return { record, idempotent: false }
}

export async function markLearningCandidatePromoted(input: {
  candidateId: string
  reviewerId: string
  promotedRef: string
}) {
  const candidate = await prisma.learningCandidate.findUnique({
    where: { id: input.candidateId },
  })
  if (!candidate) throw new Error("学习候选不存在")
  const transition = transitionLearningReview({
    current: candidate.reviewStatus as never,
    decision: "promote",
    reviewerId: input.reviewerId,
    promotedRef: input.promotedRef,
  })
  if (!transition.ok) throw new Error(transition.reason)
  return prisma.learningCandidate.update({
    where: { id: candidate.id },
    data: {
      reviewStatus: transition.next,
      reviewerId: transition.reviewerId,
      promotedRef: transition.promotedRef,
    },
  })
}
