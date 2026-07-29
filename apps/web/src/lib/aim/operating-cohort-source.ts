import type {
  BusinessAttributionSourceSnapshot,
  FeishuBusinessAttributionRecord,
} from "@/lib/aim/business-attribution-sync"
import type { PrismaClient } from "@/generated/prisma/client"
import {
  checkOperatingCohortFieldContract,
} from "@/lib/aim/operating-cohort-field-contract"
import type {
  CohortDimension,
  CohortRecord,
} from "@/lib/aim/operating-cohort"

const SOURCE_LIMIT = 500
const TRACE_LIMIT = 10_000
const DAY_MS = 24 * 60 * 60 * 1000

const DIMENSION_FIELDS: Record<CohortDimension, string> = {
  industry: "行业",
  product_type: "产品类型",
  deal_size_band: "客单价区间",
  acquisition_channel: "获客渠道",
  customer_stage: "客户阶段",
  urgency: "问题紧迫度",
}

export type OperatingCohortDb = Pick<
  PrismaClient,
  "aimGeneration" | "aimExecutionTrace" | "customerOutcomeProjection"
>

export interface OperatingCohortEnrichment {
  generationById: Map<string, { projectId: string | null }>
  costByGenerationId: Map<string, { count: number; totalCny: number }>
  outcomeByExternalId: Map<string, {
    approved: boolean
    observedTo: Date
    caseApproved: boolean
  }>
}

export interface OperatingCohortDiagnostics {
  sourceRecords: number
  eligibleSourceRecords: number
  skippedMissingLink: number
  skippedMissingLeadTime: number
  skippedOutsideProject: number
  incompleteFunnelRecords: number
  unknownDimensionValues: number
}

function scalar(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null
  if (typeof value === "number") return String(value)
  if (Array.isArray(value)) return value.length === 1 ? scalar(value[0]) : null
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  for (const key of ["record_id", "recordId", "id", "text", "name", "value"]) {
    const parsed = scalar(row[key])
    if (parsed) return parsed
  }
  return null
}

function date(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value
  if (typeof value === "number" || (typeof value === "string" && /^\d+$/.test(value))) {
    const raw = Number(value)
    const parsed = new Date(raw < 10_000_000_000 ? raw * 1000 : raw)
    return Number.isFinite(parsed.getTime()) ? parsed : null
  }
  if (typeof value !== "string") return null
  const parsed = new Date(value)
  return Number.isFinite(parsed.getTime()) ? parsed : null
}

function daysBetween(from: Date | null, to: Date | null): number | null {
  if (!from || !to || to < from) return null
  return (to.getTime() - from.getTime()) / DAY_MS
}

function sourceIds(snapshot: BusinessAttributionSourceSnapshot) {
  const generationIds = new Set<string>()
  const outcomeIds = new Set<string>()
  for (const record of snapshot.records) {
    const generationId = scalar(record.fields["AIM生成ID"])
    const outcomeId = scalar(record.fields["客户结果记录ID"])
    if (generationId) generationIds.add(generationId)
    if (outcomeId) outcomeIds.add(outcomeId)
  }
  return {
    generationIds: [...generationIds],
    outcomeIds: [...outcomeIds],
  }
}

export async function loadOperatingCohortEnrichment(input: {
  snapshot: BusinessAttributionSourceSnapshot
  db: OperatingCohortDb
}): Promise<OperatingCohortEnrichment> {
  if (input.snapshot.records.length >= SOURCE_LIMIT) {
    throw new Error("飞书经营归因记录达到 500 条读取边界，请缩短源表或增加分页后再分析")
  }
  const contract = checkOperatingCohortFieldContract(
    input.snapshot.fields.map((field) => field.name),
  )
  if (!contract.ok) {
    throw new Error(`飞书客户分群字段漂移：缺少 ${contract.missing.join("、")}`)
  }
  const { generationIds, outcomeIds } = sourceIds(input.snapshot)
  const [generations, traces, outcomes] = await Promise.all([
    input.db.aimGeneration.findMany({
      where: { id: { in: generationIds } },
      select: { id: true, projectId: true },
      take: SOURCE_LIMIT,
    }),
    input.db.aimExecutionTrace.findMany({
      where: {
        aimGenerationId: { in: generationIds },
        status: "success",
        costCny: { not: null },
      },
      select: { aimGenerationId: true, costCny: true },
      take: TRACE_LIMIT + 1,
    }),
    input.db.customerOutcomeProjection.findMany({
      where: { externalOutcomeId: { in: outcomeIds } },
      select: {
        externalOutcomeId: true,
        reviewStatus: true,
        observedTo: true,
        caseCandidate: { select: { reviewStatus: true } },
      },
      take: SOURCE_LIMIT,
    }),
  ])
  if (traces.length > TRACE_LIMIT) {
    throw new Error("成功任务 Trace 超过 10000，请缩短分析范围")
  }
  const generationById = new Map(
    generations.map((row) => [row.id, { projectId: row.projectId }]),
  )
  const costByGenerationId = new Map<string, { count: number; totalCny: number }>()
  for (const trace of traces) {
    if (!trace.aimGenerationId) continue
    const cost = Number(trace.costCny)
    if (!Number.isFinite(cost) || cost < 0) continue
    const current = costByGenerationId.get(trace.aimGenerationId) ?? {
      count: 0,
      totalCny: 0,
    }
    current.count += 1
    current.totalCny += cost
    costByGenerationId.set(trace.aimGenerationId, current)
  }
  const outcomeByExternalId = new Map(outcomes.map((row) => [
    row.externalOutcomeId,
    {
      approved: row.reviewStatus === "approved",
      observedTo: row.observedTo,
      caseApproved: row.caseCandidate?.reviewStatus === "approved",
    },
  ]))
  return { generationById, costByGenerationId, outcomeByExternalId }
}

function buildRowsForSource(input: {
  source: FeishuBusinessAttributionRecord
  enrichment: OperatingCohortEnrichment
  start: Date
  end: Date
  projectId?: string
  diagnostics: OperatingCohortDiagnostics
}): CohortRecord[] {
  const generationId = scalar(input.source.fields["AIM生成ID"])
  const externalLeadId = scalar(input.source.fields["线索记录ID"])
  if (!input.source.recordId || !generationId || !externalLeadId) {
    input.diagnostics.skippedMissingLink += 1
    return []
  }
  const generation = input.enrichment.generationById.get(generationId)
  if (!generation) {
    input.diagnostics.skippedMissingLink += 1
    return []
  }
  if (input.projectId && generation.projectId !== input.projectId) {
    input.diagnostics.skippedOutsideProject += 1
    return []
  }
  const leadAt = date(input.source.fields["线索发生时间"])
  if (!leadAt) {
    input.diagnostics.skippedMissingLeadTime += 1
    return []
  }
  if (leadAt < input.start || leadAt >= input.end) return []
  const appointmentAt = date(input.source.fields["预约发生时间"])
  const dealAt = date(input.source.fields["成交发生时间"])
  const paymentAt = date(input.source.fields["回款发生时间"])
  const outcomeId = scalar(input.source.fields["客户结果记录ID"])
  const outcome = outcomeId
    ? input.enrichment.outcomeByExternalId.get(outcomeId)
    : undefined
  const cost = input.enrichment.costByGenerationId.get(generationId)
  const appointmentEvidence = Boolean(
    scalar(input.source.fields["预约记录ID"]) && appointmentAt,
  )
  const dealEvidence = Boolean(scalar(input.source.fields["成交记录ID"]) && dealAt)
  const paymentEvidence = Boolean(
    scalar(input.source.fields["回款记录ID"]) && paymentAt,
  )
  const appointmentReached = appointmentEvidence
  const dealReached = appointmentReached && dealEvidence
  const paymentReached = dealReached && paymentEvidence
  const outcomeReached = paymentReached && outcome?.approved === true
  if (
    (dealEvidence && !appointmentEvidence)
    || (paymentEvidence && !dealEvidence)
    || (outcome?.approved && !paymentEvidence)
  ) input.diagnostics.incompleteFunnelRecords += 1
  input.diagnostics.eligibleSourceRecords += 1
  return Object.entries(DIMENSION_FIELDS).map(([dimension, field]) => {
    const segmentKey = scalar(input.source.fields[field]) ?? "unknown"
    if (segmentKey === "unknown") input.diagnostics.unknownDimensionValues += 1
    return {
      externalRecordId: input.source.recordId,
      dimension: dimension as CohortDimension,
      segmentKey,
      leadCount: 1,
      appointmentCount: appointmentReached ? 1 : 0,
      dealCount: dealReached ? 1 : 0,
      paymentCount: paymentReached ? 1 : 0,
      customerOutcomeSuccessCount: outcomeReached ? 1 : 0,
      dealCycleDays: dealReached ? daysBetween(leadAt, dealAt) : null,
      deliveryCycleDays:
        outcomeReached ? daysBetween(dealAt, outcome?.observedTo ?? null) : null,
      successTaskCostCny:
        cost && cost.count > 0 ? cost.totalCny / cost.count : null,
      successTaskCount: cost?.count ?? 0,
      successTaskTotalCostCny: cost?.totalCny ?? 0,
      caseApproved: outcomeReached ? outcome?.caseApproved : null,
      windowStart: input.start,
      windowEnd: input.end,
    }
  })
}

export function buildOperatingCohortRecords(input: {
  snapshot: BusinessAttributionSourceSnapshot
  enrichment: OperatingCohortEnrichment
  start: Date
  end: Date
  projectId?: string
}) {
  const diagnostics: OperatingCohortDiagnostics = {
    sourceRecords: input.snapshot.records.length,
    eligibleSourceRecords: 0,
    skippedMissingLink: 0,
    skippedMissingLeadTime: 0,
    skippedOutsideProject: 0,
    incompleteFunnelRecords: 0,
    unknownDimensionValues: 0,
  }
  const seen = new Set<string>()
  const records: CohortRecord[] = []
  for (const source of input.snapshot.records) {
    if (seen.has(source.recordId)) continue
    seen.add(source.recordId)
    records.push(...buildRowsForSource({ ...input, source, diagnostics }))
  }
  return { records, diagnostics }
}
