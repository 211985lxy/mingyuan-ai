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
}

export interface UpsertOutcomeAttributionInput {
  userId: string
  generationId: string
  externalLeadId: string
  externalAppointmentId?: string | null
  externalDealId?: string | null
  externalPaymentId?: string | null
  explicitLink?: boolean
  firstTouchGenerationId?: string | null
  occurredAt: Date
}

export interface OutcomeAttributionStorePort {
  findByExternalLeadId(externalLeadId: string): Promise<OutcomeAttributionRecord | null>
  findByExternalDealId(externalDealId: string): Promise<OutcomeAttributionRecord | null>
  findByExternalPaymentId(externalPaymentId: string): Promise<OutcomeAttributionRecord | null>
  create(
    data: Omit<OutcomeAttributionRecord, "id"> & { id?: string },
  ): Promise<OutcomeAttributionRecord>
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
  if (trimmed && isAttributionMethod(trimmed)) return trimmed
  return "unknown"
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

  const existingByLead = await store.findByExternalLeadId(externalLeadId)
  if (existingByLead) {
    return { record: existingByLead, created: false }
  }

  const dealId = input.externalDealId?.trim() || null
  if (dealId) {
    const existingByDeal = await store.findByExternalDealId(dealId)
    if (existingByDeal) {
      return { record: existingByDeal, created: false }
    }
  }

  const paymentId = input.externalPaymentId?.trim() || null
  if (paymentId) {
    const existingByPayment = await store.findByExternalPaymentId(paymentId)
    if (existingByPayment) {
      return { record: existingByPayment, created: false }
    }
  }

  const { method, confidence } = resolveAttributionMethod({
    explicitLink: input.explicitLink,
    firstTouchGenerationId: input.firstTouchGenerationId,
    candidateGenerationId: input.generationId,
    externalLeadId,
  })

  const record = await store.create({
    userId: input.userId,
    generationId: input.generationId,
    externalLeadId,
    externalAppointmentId: input.externalAppointmentId?.trim() || null,
    externalDealId: dealId,
    externalPaymentId: paymentId,
    attributionMethod: method,
    attributionConfidence: confidence,
    occurredAt: input.occurredAt,
  })

  return { record, created: true }
}
