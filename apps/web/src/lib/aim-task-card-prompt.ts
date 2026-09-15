type AimTaskCard = {
  audience?: string
  pain?: string
  core_claim?: string
  case_refs?: string[]
  product_link?: string
  platform_angles?: Record<string, string>
}

/** 纯函数：按内容任务卡生成可预测的 prompt 文本块。 */
export function buildTaskCardPromptBlock(
  enabled: boolean,
  card: AimTaskCard | null | undefined,
): string {
  if (!enabled) return ""
  if (!card || !card.core_claim || !String(card.core_claim).trim()) return ""
  const audience = card.audience?.trim() || "(未填写)"
  const pain = card.pain?.trim() || "(未填写)"
  const core = String(card.core_claim).trim()
  const caseRefs = Array.isArray(card.case_refs) && card.case_refs.length > 0
    ? card.case_refs.filter((s) => typeof s === "string" && s.trim().length > 0).join("，")
    : "(未提供)"
  const productLink = card.product_link?.trim() || "(未填写)"
  const platformAngles = card.platform_angles && typeof card.platform_angles === "object"
    ? Object.entries(card.platform_angles)
        .filter(([, value]) => typeof value === "string" && value.trim().length > 0)
        .map(([key, value]) => `${key}: ${value}`)
        .join(" / ") || "(未填写)"
    : "(未填写)"
  return (
    "\n\n=== 本轮任务卡 ===\n" +
    `写给谁: ${audience}\n` +
    `用户痛点: ${pain}\n` +
    `核心观点: ${core}\n` +
    `素材案例: ${caseRefs}\n` +
    `承接产品: ${productLink}\n` +
    `平台角度: ${platformAngles}`
  )
}
