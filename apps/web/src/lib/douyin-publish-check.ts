/**
 * 抖音发布前自查（P0）
 *
 * 两层：词面召回 → 语境判定（越线表达 + 危险绑定）。
 * 词面命中只是候选；仅提示不挡「可发」。
 */

import {
  COMMERCIAL_BIND_HINTS,
  PUBLISH_PRECHECK_DISCLAIMER,
  PUBLISH_PRECHECK_RECHECK_HINT,
  PUBLISH_PRECHECK_RULES,
  SAFE_CONTEXT_PHRASES,
  type PublishPrecheckRule,
} from "@/lib/aim/publish-precheck-rules"

export type DouyinPublishVerdict = "可发" | "改完可发" | "高风险勿发"
export type DouyinPublishSeverity = "high" | "mid" | "low"

export interface DouyinPublishViolation {
  text: string
  severity: DouyinPublishSeverity
  category: string
  reason: string
  suggest: string
  ruleId?: string
  /** true = 仅提示，不挡发布结论 */
  advisory?: boolean
  evidence?: string
}

export interface DouyinPublishCheck {
  verdict: DouyinPublishVerdict
  violations: DouyinPublishViolation[]
  aiLabelReminder: string
  trafficScore: {
    score: number
    level: "高" | "中" | "低"
    reasons: string[]
  }
  trafficWeakness: string[]
  minimalRewrite: string
  disclaimer: string
  recheckHint?: string
}

interface SurfaceHit {
  rule: PublishPrecheckRule
  term: string
  index: number
}

function isSafeAbsoluteContext(content: string, term: string): boolean {
  if (SAFE_CONTEXT_PHRASES.some((phrase) => content.includes(phrase))) {
    if (term === "最好" || term.startsWith("最") || term.includes("第一")) return true
  }
  // 「我用过最顺手」类：最 + 个人限定
  if (
    (term === "最好" || term.startsWith("全网最")) &&
    /我(用过|觉得|个人)/.test(content)
  ) {
    return true
  }
  return false
}

function hasDangerousBind(content: string, rule: PublishPrecheckRule, term: string): boolean {
  if (rule.bindHints.length === 0) return true

  // 引流类：命中词本身往往就是站外动作
  if (rule.id === "R05") {
    const actionLike =
      /私信|加微|加我|加群|vx|VX|\bwx\b|二维码|扫码|主页找我|看我主页/i.test(term) ||
      /私信我|加微信|加我微信|加我\s*vx|扫码进|加群/.test(content)
    if (actionLike) return true
  }

  // 收益保证：确定性用词与回本/收益邻近，或已绑转化
  if (rule.id === "R03") {
    const certaintyPayoff =
      /(保证|稳赚|必定|一定|肯定).{0,12}(回本|收益|赚钱|月入)/.test(content) ||
      /(回本|收益).{0,12}(保证|稳赚)/.test(content)
    const conversion = COMMERCIAL_BIND_HINTS.some((hint) => content.includes(hint))
    if (certaintyPayoff || conversion) return true
    // 仅「月入过万」类卖点词、无承诺无转化 → 不构成必改
    return false
  }

  // 效果保证：期限感 + 功效，或绑下单
  if (rule.id === "R04") {
    const timedEffect =
      /(两周|一周|几天|二十八天|28天|吃了).{0,16}(瘦|见效|根治|好了)/.test(content) ||
      /(瘦了?\d+斤|根治|包治)/.test(content)
    const conversion = COMMERCIAL_BIND_HINTS.some((hint) => content.includes(hint))
    return timedEffect || conversion
  }

  return rule.bindHints.some((hint) => {
    if (hint === term) return true
    return content.includes(hint)
  })
}

function collectSurfaceHits(content: string): SurfaceHit[] {
  const hits: SurfaceHit[] = []
  for (const rule of PUBLISH_PRECHECK_RULES) {
    // 长词优先，减少短词误切
    const terms = [...rule.surfaceTerms].sort((a, b) => b.length - a.length)
    for (const term of terms) {
      let from = 0
      while (from < content.length) {
        const index = content.indexOf(term, from)
        if (index === -1) break
        hits.push({ rule, term, index })
        from = index + term.length
      }
    }
  }
  return hits
}

function judgeHits(content: string, hits: SurfaceHit[]): DouyinPublishViolation[] {
  const violations: DouyinPublishViolation[] = []
  const seen = new Set<string>()

  for (const hit of hits) {
    const key = `${hit.rule.id}:${hit.term}`
    if (seen.has(key)) continue
    seen.add(key)

    if (isSafeAbsoluteContext(content, hit.term)) continue

    const bound = hasDangerousBind(content, hit.rule, hit.term)
    if (!bound) {
      // 词面有了但无危险绑定 → 仅提示（低优先级）
      violations.push({
        text: hit.term,
        severity: "low",
        category: hit.rule.category,
        reason: `${hit.rule.reason}（当前未见危险绑定，仅提示）`,
        suggest: hit.rule.suggest,
        ruleId: hit.rule.id,
        advisory: true,
        evidence: `命中「${hit.term}」，但符合「${hit.rule.clearedWhen}」方向，未升为必改。`,
      })
      continue
    }

    violations.push({
      text: hit.term,
      severity: hit.rule.severity,
      category: hit.rule.category,
      reason: hit.rule.reason,
      suggest: hit.rule.suggest,
      ruleId: hit.rule.id,
      advisory: false,
      evidence: `命中「${hit.term}」，且文中出现危险绑定线索（规则 ${hit.rule.id}）。`,
    })
  }

  // 复合：保证…回本 即使没进 surface 列表也要拦
  if (
    !violations.some((item) => item.ruleId === "R03" && !item.advisory) &&
    /(保证|稳赚|必定|一定|肯定).{0,16}(回本|收益)/.test(content) &&
    COMMERCIAL_BIND_HINTS.some((hint) => content.includes(hint))
  ) {
    violations.push({
      text: "保证回本",
      severity: "high",
      category: "收益承诺",
      reason: "向受众承诺可复制收益或回本，属于极高风险。",
      suggest: "改为「我个人那段时间的结果」「过程因人而异，别当承诺」。",
      ruleId: "R03",
      advisory: false,
      evidence: "出现确定性用词绑定回本/收益，且带转化引导。",
    })
  }

  return violations
}

function buildMinimalRewrite(content: string, violations: DouyinPublishViolation[]) {
  let rewritten = content
  const blocking = violations.filter((item) => !item.advisory)
  for (const violation of blocking) {
    const rule = PUBLISH_PRECHECK_RULES.find((item) => item.id === violation.ruleId)
    const replacement =
      rule?.replaceWith ||
      violation.suggest.match(/「([^」]+)」/)?.[1] ||
      "更稳妥的说法"
    rewritten = rewritten.split(violation.text).join(replacement)
  }
  return rewritten
}

function detectTrafficWeakness(content: string) {
  const weaknesses: string[] = []
  const opening = content.trim().slice(0, 50)
  if (!/[？?]|为什么|别再|很多人|你是不是|普通人|新手|避坑|先别/.test(opening)) {
    weaknesses.push("前 3 秒钩子偏平，建议补一个痛点、反常识或避坑句。")
  }
  if (!/步骤|清单|模板|方法|收藏|照着做|避坑|案例|工具/.test(content)) {
    weaknesses.push("收藏价值不够明确，建议补一个可复用步骤、清单或模板。")
  }
  if (!/评论|关注|收藏|下期|留言/.test(content)) {
    weaknesses.push("结尾缺少站内互动动作，建议引导收藏、评论或关注。")
  }
  return weaknesses.slice(0, 3)
}

function scoreTrafficPotential(content: string, violations: DouyinPublishViolation[]) {
  let score = 100
  const reasons: string[] = []
  const opening = content.trim().slice(0, 50)
  const blocking = violations.filter((item) => !item.advisory)

  if (blocking.some((item) => item.severity === "high")) {
    score -= 25
    reasons.push("存在高风险发布表达，会明显拖累推荐。")
  }
  if (blocking.some((item) => item.severity === "mid")) {
    score -= 10
    reasons.push("存在中风险夸张表达，建议发布前降调。")
  }
  if (!/[？?]|为什么|别再|很多人|你是不是|普通人|新手|避坑|先别/.test(opening)) {
    score -= 15
    reasons.push("前 3 秒停留钩子不够强。")
  }
  if (!/步骤|清单|模板|方法|收藏|照着做|避坑|案例|工具/.test(content)) {
    score -= 15
    reasons.push("收藏价值不够明确。")
  }
  if (!/评论|关注|收藏|下期|留言/.test(content)) {
    score -= 10
    reasons.push("缺少站内互动承接。")
  }
  if (content.length < 180 || content.length > 650) {
    score -= 10
    reasons.push("口播长度不在抖音常用节奏区间。")
  }

  score = Math.max(0, Math.min(100, score))
  return {
    score,
    level: score >= 80 ? ("高" as const) : score >= 60 ? ("中" as const) : ("低" as const),
    reasons: reasons.length > 0 ? reasons.slice(0, 4) : ["钩子、收藏价值和互动承接较完整。"],
  }
}

function detectAiLabelReminder(content: string) {
  return /AI生成|AI写|AI配音|AI画面|AI数字人|AI剪辑|数字人/.test(content)
    ? "疑似含 AI 生成/辅助内容，发布端建议勾选 AI 标签，并在前 5 秒加「含 AI 生成内容」提示。"
    : "未发现明确 AI 生成内容声明；如实际使用 AI 画面、配音或数字人，仍需按平台要求标注。"
}

function resolveVerdict(violations: DouyinPublishViolation[]): DouyinPublishVerdict {
  const blocking = violations.filter((item) => !item.advisory)
  const highCount = blocking.filter((item) => item.severity === "high").length
  if (blocking.length === 0) return "可发"
  if (highCount >= 2) return "高风险勿发"
  return "改完可发"
}

/**
 * @description 运行抖音发布前自查（词面召回 + 语境判定）
 */
export function runDouyinPublishCheck(content: string): DouyinPublishCheck {
  const hits = collectSurfaceHits(content)
  const violations = judgeHits(content, hits)
  const blocking = violations.filter((item) => !item.advisory)
  const verdict = resolveVerdict(violations)

  return {
    verdict,
    violations,
    aiLabelReminder: detectAiLabelReminder(content),
    trafficScore: scoreTrafficPotential(content, violations),
    trafficWeakness: detectTrafficWeakness(content),
    minimalRewrite: buildMinimalRewrite(content, violations),
    disclaimer: PUBLISH_PRECHECK_DISCLAIMER,
    recheckHint: blocking.length > 0 ? PUBLISH_PRECHECK_RECHECK_HINT : undefined,
  }
}
