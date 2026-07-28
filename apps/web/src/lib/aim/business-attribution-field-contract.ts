/**
 * 飞书经营归因字段契约（WP-3）。
 *
 * 只读核对：对照真实 Base 字段名集合，无密钥时不调真 API。
 * 生产表应包含本清单；多出来的字段不视为失败。
 */

/** 飞书 Base 稳定关联字段（只读核对清单）。 */
export const BUSINESS_ATTRIBUTION_FIELD_NAMES = [
  "AIM生成ID",
  "来源内容ID",
  "线索记录ID",
  "预约记录ID",
  "成交记录ID",
  "回款记录ID",
  "客户结果记录ID",
  "归因方式",
  "归因确认人",
] as const

export type BusinessAttributionFieldName = (typeof BUSINESS_ATTRIBUTION_FIELD_NAMES)[number]

export interface BusinessAttributionFieldContractResult {
  ok: boolean
  missing: string[]
  /** 表上多出来的字段不视为失败，仅供审计 */
  extra: string[]
}

/**
 * @description 对照真实表字段名，检查经营归因契约是否满足
 */
export function checkBusinessAttributionFieldContract(
  actualFieldNames: readonly string[],
): BusinessAttributionFieldContractResult {
  const actual = new Set(actualFieldNames.map((name) => name.trim()).filter(Boolean))
  const missing = BUSINESS_ATTRIBUTION_FIELD_NAMES.filter((name) => !actual.has(name))
  const required = new Set<string>(BUSINESS_ATTRIBUTION_FIELD_NAMES)
  const extra = [...actual].filter((name) => !required.has(name)).sort()
  return { ok: missing.length === 0, missing: [...missing], extra }
}
