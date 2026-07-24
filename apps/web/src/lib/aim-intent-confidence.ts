/**
 * 意图规则置信度（纯函数，客户端/服务端均可引用）
 *
 * 先判冲突口令，再判单一明确意图——避免 create 高分提前 return 挡住冲突降权。
 */

import type { AimTurnIntent } from "@/lib/aim-turn-intent"
import { looksLikeCopyAnalysisQuestion, looksLikePassagePolish } from "@/lib/aim-turn-intent"

export const INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD = 0.72
export const INTENT_VECTOR_MATCH_MIN_SCORE = 0.72
/** Top1 与 Top2 分差低于此值视为歧义，不覆盖规则 */
export const INTENT_VECTOR_TOP_MARGIN = 0.06

/**
 * 规则意图置信度：越高越不需要向量。
 * chat / 冲突口令偏低，明确写改指令偏高；结构分析问句的 chat 偏高，避免被向量改成 rewrite。
 */
export function scoreTurnIntentRuleConfidence(intent: AimTurnIntent, rawInput: string): number {
  const text = rawInput || ""

  // 1) 冲突口令优先降权（必须在 create 高分 return 之前）
  if (/人设|定位|选题/.test(text) && /种草|小红书|口播|文案/.test(text)) return 0.4
  if (/优化|改|润色/.test(text) && /写|生成|种草/.test(text) && !/只(优化|改)|不要改|别改/.test(text)) {
    return 0.45
  }

  // 2) 单一明确意图
  if (intent.action === "local_edit" && looksLikePassagePolish(text)) return 0.91
  if (intent.action === "local_edit" && intent.scope !== "unspecified") return 0.93
  if (intent.action === "local_edit") return 0.82
  if (intent.action === "create" && /写一篇|写一版|写一条|种草|帮我写|出一版|出一条|生成/.test(text)) {
    return 0.88
  }
  if (intent.action === "create") return 0.78
  if (intent.action === "rewrite" && /重写|改写|重做|推倒/.test(text)) return 0.9
  if (intent.action === "rewrite") return 0.8
  if (intent.action === "review") return 0.92
  if (intent.action === "position" && !/种草|小红书|口播|文案/.test(text)) return 0.86
  if (intent.action === "chat" && looksLikeCopyAnalysisQuestion(text)) return 0.9
  if (intent.action === "chat") return 0.35
  return 0.65
}

export function shouldTryVectorIntentFallback(ruleConfidence: number): boolean {
  return ruleConfidence < INTENT_VECTOR_RULE_CONFIDENCE_THRESHOLD
}
