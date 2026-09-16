/**
 * 内容目标词汇表（单一真源）：类型、从文本判定目标、给人看的标签。
 *
 * 判定顺序即优先级（沿用原 resolved-user-intent 内的实现，行为不变）：
 * 获客 > 成交 > 人设信任 > 流量。任何"从一段文字里读出内容目标"的地方都走这里，
 * 不要各自维护关键词表。
 */
export type AimContentGoal = "traffic" | "lead" | "convert" | "trust" | "brand"

export const AIM_CONTENT_GOAL_LABELS: Record<AimContentGoal, string> = {
  traffic: "搞流量",
  lead: "获客咨询",
  convert: "成交转化",
  trust: "建立人设信任",
  brand: "品牌",
}

export function detectGoal(text: string): AimContentGoal | undefined {
  if (/(获客|引流|留资|私信|咨询|线索|线索获客|预约)/.test(text)) return "lead"
  if (/(成交|转化|卖货|下单|购买|招商)/.test(text)) return "convert"
  if (/(人设|信任|故事|来时路|品牌)/.test(text)) return "trust"
  if (/(涨粉|流量|曝光|起号|播放)/.test(text)) return "traffic"
  return undefined
}
