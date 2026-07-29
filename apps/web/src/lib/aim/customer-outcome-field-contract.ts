/**
 * 飞书客户结果正本的只读字段契约（WP-4）。
 * 只核对字段，不由 AIM 创建或修改飞书记录。
 */
export const CUSTOMER_OUTCOME_FIELD_NAMES = [
  "客户结果记录ID",
  "项目ID",
  "成交记录ID",
  "指标编码",
  "基线",
  "目标",
  "实际",
  "单位",
  "观察开始",
  "观察结束",
  "证据引用",
  "审核状态",
  "审核人",
  "审核时间",
] as const

export function checkCustomerOutcomeFieldContract(
  actualFieldNames: readonly string[],
): { ok: boolean; missing: string[]; extra: string[] } {
  const actual = new Set(actualFieldNames.map((name) => name.trim()).filter(Boolean))
  const required = new Set<string>(CUSTOMER_OUTCOME_FIELD_NAMES)
  const missing = CUSTOMER_OUTCOME_FIELD_NAMES.filter((name) => !actual.has(name))
  const extra = [...actual].filter((name) => !required.has(name)).sort()
  return { ok: missing.length === 0, missing: [...missing], extra }
}
