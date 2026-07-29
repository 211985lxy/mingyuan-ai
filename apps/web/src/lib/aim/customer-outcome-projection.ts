import {
  CUSTOMER_OUTCOME_REVIEW_STATUSES,
  canPromoteSuccessCase,
  type CustomerOutcomeProjectionLike,
  type CustomerOutcomeReviewStatus,
} from "@/lib/aim/customer-outcome"

export interface CustomerOutcomeProjectionRecord
  extends CustomerOutcomeProjectionLike {
  externalRecordId: string | null
  externalTableId: string | null
}

export interface CustomerOutcomeProjectionInput {
  projectId: string
  externalOutcomeId: string
  externalDealId?: string | null
  externalRecordId?: string | null
  externalTableId?: string | null
  metricCode: string
  baseline?: number | string | null
  target?: number | string | null
  actual?: number | string | null
  unit?: string | null
  observedFrom: Date
  observedTo: Date
  evidenceRef?: string | null
  reviewStatus: string
  reviewerRef?: string | null
  reviewedAt?: Date | null
}

export interface CustomerOutcomeProjectionStorePort {
  findByExternalOutcomeId(
    externalOutcomeId: string,
  ): Promise<CustomerOutcomeProjectionRecord | null>
  findByExternalRecordId(
    externalRecordId: string,
  ): Promise<CustomerOutcomeProjectionRecord | null>
  create(
    data: Omit<CustomerOutcomeProjectionRecord, "id"> & { id?: string },
  ): Promise<CustomerOutcomeProjectionRecord>
  update(
    id: string,
    data: Partial<Omit<CustomerOutcomeProjectionRecord, "id" | "projectId" | "externalOutcomeId">>,
  ): Promise<CustomerOutcomeProjectionRecord>
}

export class CustomerOutcomeProjectionError extends Error {
  constructor(
    message: string,
    readonly code:
      | "invalid_status"
      | "invalid_period"
      | "missing_required_field"
      | "approved_without_evidence"
      | "projection_conflict",
  ) {
    super(message)
    this.name = "CustomerOutcomeProjectionError"
  }
}

function optional(value: string | null | undefined): string | null {
  return value?.trim() || null
}

function required(value: string | null | undefined, label: string): string {
  const normalized = optional(value)
  if (!normalized) {
    throw new CustomerOutcomeProjectionError(
      `${label}不能为空`,
      "missing_required_field",
    )
  }
  return normalized
}

function normalizeStatus(value: string): CustomerOutcomeReviewStatus {
  const normalized = value.trim().toLowerCase()
  if ((CUSTOMER_OUTCOME_REVIEW_STATUSES as readonly string[]).includes(normalized)) {
    return normalized as CustomerOutcomeReviewStatus
  }
  throw new CustomerOutcomeProjectionError(
    `未知客户结果审核状态：${value}`,
    "invalid_status",
  )
}

function stable(
  label: string,
  existing: string | null,
  incoming: string | null,
): string | null {
  if (existing && incoming && existing !== incoming) {
    throw new CustomerOutcomeProjectionError(
      `${label}已绑定其它记录，拒绝静默改写`,
      "projection_conflict",
    )
  }
  return existing ?? incoming
}

function normalizeInput(
  input: CustomerOutcomeProjectionInput,
): Omit<CustomerOutcomeProjectionRecord, "id"> {
  if (
    !Number.isFinite(input.observedFrom.getTime())
    || !Number.isFinite(input.observedTo.getTime())
    || input.observedFrom.getTime() > input.observedTo.getTime()
  ) {
    throw new CustomerOutcomeProjectionError(
      "客户结果观察区间无效",
      "invalid_period",
    )
  }
  const normalized = {
    projectId: required(input.projectId, "项目ID"),
    externalOutcomeId: required(input.externalOutcomeId, "客户结果记录ID"),
    externalDealId: optional(input.externalDealId),
    externalRecordId: optional(input.externalRecordId),
    externalTableId: optional(input.externalTableId),
    metricCode: required(input.metricCode, "指标编码"),
    baseline: input.baseline ?? null,
    target: input.target ?? null,
    actual: input.actual ?? null,
    unit: optional(input.unit),
    observedFrom: input.observedFrom,
    observedTo: input.observedTo,
    evidenceRef: optional(input.evidenceRef) ?? "",
    reviewStatus: normalizeStatus(input.reviewStatus),
    reviewerRef: optional(input.reviewerRef),
    reviewedAt: input.reviewedAt ?? null,
  }
  if (
    normalized.reviewStatus === "approved"
    && !canPromoteSuccessCase({ id: "validation", ...normalized })
  ) {
    throw new CustomerOutcomeProjectionError(
      "审核通过的客户结果必须包含 baseline、actual、证据、审核人和审核时间",
      "approved_without_evidence",
    )
  }
  return normalized
}

export async function upsertCustomerOutcomeProjection(
  input: CustomerOutcomeProjectionInput,
  store: CustomerOutcomeProjectionStorePort,
): Promise<{ record: CustomerOutcomeProjectionRecord; created: boolean }> {
  const normalized = normalizeInput(input)
  const byRecord = normalized.externalRecordId
    ? await store.findByExternalRecordId(normalized.externalRecordId)
    : null
  const byOutcome = await store.findByExternalOutcomeId(normalized.externalOutcomeId)
  const existing = byRecord ?? byOutcome
  if (!existing) {
    const draftId = globalThis.crypto.randomUUID()
    const record = await store.create({ id: draftId, ...normalized })
    return { record, created: record.id === draftId }
  }
  if (
    existing.projectId !== normalized.projectId
    || existing.externalOutcomeId !== normalized.externalOutcomeId
    || existing.metricCode !== normalized.metricCode
  ) {
    throw new CustomerOutcomeProjectionError(
      "客户结果正本尝试改绑项目、结果ID或指标编码，需人工核对",
      "projection_conflict",
    )
  }
  const record = await store.update(existing.id, {
    externalDealId: stable(
      "成交记录ID",
      existing.externalDealId ?? null,
      normalized.externalDealId ?? null,
    ),
    externalRecordId: stable(
      "飞书记录ID",
      existing.externalRecordId,
      normalized.externalRecordId,
    ),
    externalTableId: stable(
      "飞书表ID",
      existing.externalTableId,
      normalized.externalTableId,
    ),
    baseline: normalized.baseline,
    target: normalized.target,
    actual: normalized.actual,
    unit: normalized.unit,
    observedFrom: normalized.observedFrom,
    observedTo: normalized.observedTo,
    evidenceRef: normalized.evidenceRef,
    reviewStatus: normalized.reviewStatus,
    reviewerRef: normalized.reviewerRef,
    reviewedAt: normalized.reviewedAt,
  })
  return { record, created: false }
}
