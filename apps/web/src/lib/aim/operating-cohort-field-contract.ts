import {
  BUSINESS_ATTRIBUTION_FIELD_NAMES,
} from "@/lib/aim/business-attribution-field-contract"

export const OPERATING_COHORT_DIMENSION_FIELDS = [
  "行业",
  "产品类型",
  "客单价区间",
  "获客渠道",
  "客户阶段",
  "问题紧迫度",
] as const

export const OPERATING_COHORT_TIME_FIELDS = [
  "线索发生时间",
  "预约发生时间",
  "成交发生时间",
  "回款发生时间",
] as const

export const OPERATING_COHORT_FIELD_NAMES = [
  ...BUSINESS_ATTRIBUTION_FIELD_NAMES,
  ...OPERATING_COHORT_DIMENSION_FIELDS,
  ...OPERATING_COHORT_TIME_FIELDS,
] as const

export function checkOperatingCohortFieldContract(
  actualFieldNames: readonly string[],
) {
  const actual = new Set(actualFieldNames.map((name) => name.trim()).filter(Boolean))
  const missing = OPERATING_COHORT_FIELD_NAMES.filter((name) => !actual.has(name))
  const required = new Set<string>(OPERATING_COHORT_FIELD_NAMES)
  const extra = [...actual].filter((name) => !required.has(name)).sort()
  return { ok: missing.length === 0, missing: [...missing], extra }
}
