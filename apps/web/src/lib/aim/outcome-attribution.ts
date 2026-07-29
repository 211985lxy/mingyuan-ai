/**
 * 逐笔经营归因域层（WP-3）。
 *
 * 第一版只支持 explicit / first_touch / unknown；证据不足必须记 unknown。
 * ContentOutcome 仍是 7/14/30 累计快照，不替代本表的逐笔记录。
 * 不建 Lead / Deal / Payment CRM 实体，只存外部 ID 投影。
 */

export const ATTRIBUTION_METHODS = ["explicit", "first_touch", "unknown"] as const
export type AttributionMethod = (typeof ATTRIBUTION_METHODS)[number]

export const ATTRIBUTION_CONFIDENCES = ["high", "medium", "low"] as const
export type AttributionConfidence = (typeof ATTRIBUTION_CONFIDENCES)[number]

export interface OutcomeAttributionRecord {
  id: string
  userId: string
  generationId: string
  externalLeadId: string
  externalAppointmentId: string | null
  externalDealId: string | null
  externalPaymentId: string | null
  externalRecordId: string | null
  externalTableId: string | null
  externalSourceContentId: string | null
  externalAttributionConfirmer: string | null
  attributionMethod: AttributionMethod
  attributionConfidence: AttributionConfidence
  occurredAt: Date
}

export interface AttributionEvidenceInput {
  /** 人工或系统明确把该内容与线索绑在一起 */
  explicitLink?: boolean
  /** 已知的首触 generationId；与 candidate 一致才可判 first_touch */
  firstTouchGenerationId?: string | null
  candidateGenerationId: string
  externalLeadId?: string | null
  declaredMethod?: string | null
  confirmedBy?: string | null
}

export interface UpsertOutcomeAttributionInput {
  userId: string
  generationId: string
  externalLeadId: string
  externalAppointmentId?: string | null
  externalDealId?: string | null
  externalPaymentId?: string | null
  externalRecordId?: string | null
  externalTableId?: string | null
  externalSourceContentId?: string | null
  externalAttributionConfirmer?: string | null
  declaredMethod?: string | null
  explicitLink?: boolean
  firstTouchGenerationId?: string | null
  occurredAt: Date
}

export interface OutcomeAttributionStorePort {
  findByExternalRecordId(externalRecordId: string): Promise<OutcomeAttributionRecord | null>
  findByExternalLeadId(externalLeadId: string): Promise<OutcomeAttributionRecord | null>
  findByExternalDealId(externalDealId: string): Promise<OutcomeAttributionRecord | null>
  findByExternalPaymentId(externalPaymentId: string): Promise<OutcomeAttributionRecord | null>
  create(
    data: Omit<OutcomeAttributionRecord, "id"> & { id?: string },
  ): Promise<OutcomeAttributionRecord>
  update(
    id: string,
    data: Partial<Omit<OutcomeAttributionRecord, "id" | "userId" | "generationId">>,
  ): Promise<OutcomeAttributionRecord>
}

export class AttributionConflictError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "AttributionConflictError"
  }
}

function isAttributionMethod(value: string): value is AttributionMethod {
  return (ATTRIBUTION_METHODS as readonly string[]).includes(value)
}

/**
 * @description 根据证据解析归因方式；证据不足一律 unknown，禁止强行匹配
 */
export function resolveAttributionMethod(evidence: AttributionEvidenceInput): {
  method: AttributionMethod
  confidence: AttributionConfidence
} {
  const leadId = evidence.externalLeadId?.trim()
  if (!leadId) {
    return { method: "unknown", confidence: "low" }
  }

  const declared = normalizeAttributionMethod(evidence.declaredMethod)
  if (evidence.confirmedBy?.trim() && declared !== "unknown") {
    return declared === "explicit"
      ? { method: "explicit", confidence: "high" }
      : { method: "first_touch", confidence: "medium" }
  }

  if (evidence.explicitLink === true) {
    return { method: "explicit", confidence: "high" }
  }

  const firstTouch = evidence.firstTouchGenerationId?.trim()
  if (firstTouch && firstTouch === evidence.candidateGenerationId) {
    return { method: "first_touch", confidence: "medium" }
  }

  return { method: "unknown", confidence: "low" }
}

/**
 * @description 规范化并校验归因方式；非法值降为 unknown
 */
export function normalizeAttributionMethod(value: string | null | undefined): AttributionMethod {
  const trimmed = value?.trim()
  if (trimmed === "明确归因") return "explicit"
  if (trimmed === "首触归因") return "first_touch"
  if (trimmed && isAttributionMethod(trimmed)) return trimmed
  return "unknown"
}

function normalizedOptional(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function mergeStableReference(
  label: string,
  existing: string | null,
  incoming: string | null,
): string | null {
  if (existing && incoming && existing !== incoming) {
    throw new AttributionConflictError(`${label} 已绑定其它记录，拒绝静默改写`)
  }
  return existing ?? incoming
}

function attributionRank(method: AttributionMethod): number {
  if (method === "explicit") return 2
  if (method === "first_touch") return 1
  return 0
}

async function mergeExistingAttribution(
  existing: OutcomeAttributionRecord,
  input: UpsertOutcomeAttributionInput,
  method: AttributionMethod,
  confidence: AttributionConfidence,
  store: OutcomeAttributionStorePort,
): Promise<OutcomeAttributionRecord> {
  if (
    existing.userId !== input.userId
    || existing.generationId !== input.generationId
    || existing.externalLeadId !== input.externalLeadId.trim()
  ) {
    throw new AttributionConflictError("外部经营记录已归属其它 AIM 内容，需人工核对")
  }
  const next = {
    externalAppointmentId: mergeStableReference(
      "预约记录ID",
      existing.externalAppointmentId,
      normalizedOptional(input.externalAppointmentId),
    ),
    externalDealId: mergeStableReference(
      "成交记录ID",
      existing.externalDealId,
      normalizedOptional(input.externalDealId),
    ),
    externalPaymentId: mergeStableReference(
      "回款记录ID",
      existing.externalPaymentId,
      normalizedOptional(input.externalPaymentId),
    ),
    externalRecordId: mergeStableReference(
      "飞书记录ID",
      existing.externalRecordId,
      normalizedOptional(input.externalRecordId),
    ),
    externalTableId: mergeStableReference(
      "飞书表ID",
      existing.externalTableId,
      normalizedOptional(input.externalTableId),
    ),
    externalSourceContentId: mergeStableReference(
      "来源内容ID",
      existing.externalSourceContentId,
      normalizedOptional(input.externalSourceContentId),
    ),
    externalAttributionConfirmer:
      existing.externalAttributionConfirmer
      ?? normalizedOptional(input.externalAttributionConfirmer),
    attributionMethod:
      attributionRank(method) > attributionRank(existing.attributionMethod)
        ? method
        : existing.attributionMethod,
    attributionConfidence:
      attributionRank(method) > attributionRank(existing.attributionMethod)
        ? confidence
        : existing.attributionConfidence,
  }
  return store.update(existing.id, next)
}

/**
 * @description 按外部线索/成交/回款 ID 幂等写入归因；已存在则直接返回原记录
 */
export async function upsertOutcomeAttribution(
  input: UpsertOutcomeAttributionInput,
  store: OutcomeAttributionStorePort,
): Promise<{ record: OutcomeAttributionRecord; created: boolean }> {
  const externalLeadId = input.externalLeadId.trim()
  if (!externalLeadId) {
    throw new Error("externalLeadId is required for OutcomeAttribution")
  }

  const { method, confidence } = resolveAttributionMethod({
    explicitLink: input.explicitLink,
    firstTouchGenerationId: input.firstTouchGenerationId,
    candidateGenerationId: input.generationId,
    externalLeadId,
    declaredMethod: input.declaredMethod,
    confirmedBy: input.externalAttributionConfirmer,
  })

  const dealId = input.externalDealId?.trim() || null
  if (dealId) {
    const existingByDeal = await store.findByExternalDealId(dealId)
    if (existingByDeal && existingByDeal.externalLeadId !== externalLeadId) {
      throw new AttributionConflictError("成交记录ID 已绑定其它线索，需人工核对")
    }
  }

  const paymentId = input.externalPaymentId?.trim() || null
  if (paymentId) {
    const existingByPayment = await store.findByExternalPaymentId(paymentId)
    if (existingByPayment && existingByPayment.externalLeadId !== externalLeadId) {
      throw new AttributionConflictError("回款记录ID 已绑定其它线索，需人工核对")
    }
  }

  const recordId = normalizedOptional(input.externalRecordId)
  const existingByRecord = recordId
    ? await store.findByExternalRecordId(recordId)
    : null
  const existingByLead = await store.findByExternalLeadId(externalLeadId)
  const existing = existingByRecord ?? existingByLead
  if (existing) {
    const record = await mergeExistingAttribution(
      existing,
      input,
      method,
      confidence,
      store,
    )
    return { record, created: false }
  }

  const draftId = globalThis.crypto.randomUUID()
  const record = await store.create({
    id: draftId,
    userId: input.userId,
    generationId: input.generationId,
    externalLeadId,
    externalAppointmentId: input.externalAppointmentId?.trim() || null,
    externalDealId: dealId,
    externalPaymentId: paymentId,
    externalRecordId: recordId,
    externalTableId: normalizedOptional(input.externalTableId),
    externalSourceContentId: normalizedOptional(input.externalSourceContentId),
    externalAttributionConfirmer:
      normalizedOptional(input.externalAttributionConfirmer),
    attributionMethod: method,
    attributionConfidence: confidence,
    occurredAt: input.occurredAt,
  })

  return { record, created: record.id === draftId }
}
