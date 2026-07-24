/**
 * 按方法论计划组装「仅匹配卡片」注入块（供 prepareAimContext / chat runtime 共用）。
 */

import {
  buildMethodologyBlockFromCardIds,
  getMethodologyCardById,
} from "@/lib/methodology/ip-copywriting-cards"
import {
  type CopyMethodologyPlan,
  formatMethodologyPlanForPrompt,
  resolveCopyMethodologyPlan,
  type ResolveCopyMethodologyPlanInput,
} from "@/lib/methodology/resolve-copy-methodology-plan"

const DYNAMIC_CARD_AGENTS = new Set([
  "content_producer",
  "deep_copywriter",
  "free_copywriter",
])

export function shouldUseDynamicMethodologyCards(agentId: string): boolean {
  return DYNAMIC_CARD_AGENTS.has(agentId)
}

export function composeMatchedMethodologyBlock(
  plan: CopyMethodologyPlan,
  extras?: { skillBlock?: string },
): string {
  const cards = buildMethodologyBlockFromCardIds(plan.cardIds)
  const sections = [
    formatMethodologyPlanForPrompt(plan),
    cards
      ? `【强参考卡片】（仅下列卡片，必须执行其结构与禁忌）\n${cards}`
      : "",
    extras?.skillBlock?.trim() || "",
  ]
  return sections.filter(Boolean).join("\n\n")
}

export function resolveAndComposeMethodologyBlock(
  input: ResolveCopyMethodologyPlanInput & { agentId: string; skillBlock?: string; fallbackBlock?: string },
): { plan: CopyMethodologyPlan; block: string } {
  const plan = resolveCopyMethodologyPlan(input)
  if (!shouldUseDynamicMethodologyCards(input.agentId)) {
    return {
      plan,
      block: [input.fallbackBlock, input.skillBlock].filter(Boolean).join("\n\n"),
    }
  }
  return {
    plan,
    block: composeMatchedMethodologyBlock(plan, { skillBlock: input.skillBlock }),
  }
}

export function listMethodologyCardTitles(cardIds: string[]): string[] {
  return cardIds.map((id) => {
    const card = getMethodologyCardById(id)
    return card ? `${card.title}（${id}）` : id
  })
}

/** METHOD_NOTE 用的目标/路由/卡片/结构拆解段落 */
export function buildMethodologyPlanTraceSection(plan: CopyMethodologyPlan | undefined | null): string {
  if (!plan) {
    return `### 目标判定
- 未提供/待补充

### 内容路由
- 未提供/待补充

### 调用卡片
- 未提供/待补充

### 结构拆解
- 未提供/待补充`
  }

  const cardLines = listMethodologyCardTitles(plan.cardIds)
  const structureLines = plan.structureModules.length
    ? plan.structureModules.map(
        (mod, i) => `- 模块${i + 1}「${mod}」：服务本轮 goal=${plan.businessGoal}；依据已注入卡片结构`,
      )
    : ["- 未提供/待补充"]

  return `### 目标判定
- businessGoal：${plan.businessGoal}
- 依据：source=${plan.source}；confidence=${plan.confidence.toFixed(2)}
- 假设：${plan.assumptions.length ? plan.assumptions.join("；") : "无"}

### 内容路由
- ${plan.contentRoute}${plan.localOptimize ? `；局部优化=${plan.localOptimize}` : ""}

### 调用卡片
${cardLines.length ? cardLines.map((line) => `- ${line}`).join("\n") : "- 未提供/待补充"}

### 结构拆解
${structureLines.join("\n")}`
}
