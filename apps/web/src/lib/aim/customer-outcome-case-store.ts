import { buildSuccessCaseCandidateFromCustomerOutcome } from "@/lib/aim/customer-outcome"
import { prisma } from "@/lib/prisma"

interface CustomerOutcomeCaseStorePort {
  customerOutcomeProjection: {
    findUnique(args: {
      where: { id: string }
      include: { project: { select: { userId: true; name: true } } }
    }): Promise<({
      id: string
      projectId: string
      externalOutcomeId: string
      externalDealId: string | null
      externalRecordId: string | null
      metricCode: string
      baseline: unknown
      target: unknown
      actual: unknown
      unit: string | null
      observedFrom: Date
      observedTo: Date
      evidenceRef: string
      reviewStatus: string
      reviewerRef: string | null
      reviewedAt: Date | null
      project: { userId: string; name: string }
    }) | null>
  }
  outcomeAttribution: {
    findUnique(args: {
      where: { externalDealId: string }
      select: { generationId: true; userId: true }
    }): Promise<{ generationId: string; userId: string } | null>
  }
  aimGeneration: {
    findFirst(args: {
      where: { id: string; userId: string; projectId: string }
      select: { id: true }
    }): Promise<{ id: string } | null>
  }
  assetCandidate: {
    findUnique(args: {
      where: { customerOutcomeProjectionId: string }
    }): Promise<Record<string, unknown> | null>
    create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>
  }
}

export type GenerateCustomerOutcomeCaseResult =
  | { ok: true; created: boolean; candidate: Record<string, unknown> }
  | { ok: false; status: number; error: string }

async function resolveTrustedGeneration(
  store: CustomerOutcomeCaseStorePort,
  input: {
    externalDealId: string | null
    userId: string
    projectId: string
  },
): Promise<
  | { ok: true; generationId: string }
  | { ok: false; status: 409; error: string }
> {
  if (!input.externalDealId) {
    return { ok: false, status: 409, error: "客户结果缺少成交记录ID，无法追溯原始生成" }
  }
  const attribution = await store.outcomeAttribution.findUnique({
    where: { externalDealId: input.externalDealId },
    select: { generationId: true, userId: true },
  })
  if (!attribution || attribution.userId !== input.userId) {
    return { ok: false, status: 409, error: "成交记录尚未建立可信 AIM 归因" }
  }
  const generation = await store.aimGeneration.findFirst({
    where: {
      id: attribution.generationId,
      userId: input.userId,
      projectId: input.projectId,
    },
    select: { id: true },
  })
  return generation
    ? { ok: true, generationId: generation.id }
    : { ok: false, status: 409, error: "成交归因与客户项目不匹配" }
}

export async function generateCustomerOutcomeCaseCandidate(input: {
  customerOutcomeProjectionId: string
  store?: CustomerOutcomeCaseStorePort
}): Promise<GenerateCustomerOutcomeCaseResult> {
  const store = input.store ?? (prisma as unknown as CustomerOutcomeCaseStorePort)
  const outcome = await store.customerOutcomeProjection.findUnique({
    where: { id: input.customerOutcomeProjectionId },
    include: { project: { select: { userId: true, name: true } } },
  })
  if (!outcome) return { ok: false, status: 404, error: "客户结果投影不存在" }
  const draft = buildSuccessCaseCandidateFromCustomerOutcome({
    ...outcome,
    baseline: outcome.baseline == null ? null : String(outcome.baseline),
    target: outcome.target == null ? null : String(outcome.target),
    actual: outcome.actual == null ? null : String(outcome.actual),
  }, {
    customerLabel: outcome.project.name,
  })
  if (!draft) {
    return {
      ok: false,
      status: 409,
      error: "客户结果未审核通过或缺少 baseline、actual、证据、审核人、审核时间",
    }
  }
  const existing = await store.assetCandidate.findUnique({
    where: { customerOutcomeProjectionId: outcome.id },
  })
  if (existing) return { ok: true, created: false, candidate: existing }
  const trusted = await resolveTrustedGeneration(store, {
    externalDealId: outcome.externalDealId,
    userId: outcome.project.userId,
    projectId: outcome.projectId,
  })
  if (!trusted.ok) return trusted
  try {
    const candidate = await store.assetCandidate.create({
      data: {
        userId: outcome.project.userId,
        projectId: outcome.projectId,
        generationId: trusted.generationId,
        feishuRecordId: outcome.externalRecordId,
        customerOutcomeProjectionId: outcome.id,
        kind: draft.kind,
        title: draft.title,
        content: draft.content,
        evidence: draft.evidence,
        confidence: draft.confidence,
        reviewStatus: "pending",
        crossProjectAllowed: false,
      },
    })
    return { ok: true, created: true, candidate }
  } catch (error) {
    if (
      error
      && typeof error === "object"
      && "code" in error
      && (error as { code?: unknown }).code === "P2002"
    ) {
      const raced = await store.assetCandidate.findUnique({
        where: { customerOutcomeProjectionId: outcome.id },
      })
      if (raced) return { ok: true, created: false, candidate: raced }
    }
    throw error
  }
}
