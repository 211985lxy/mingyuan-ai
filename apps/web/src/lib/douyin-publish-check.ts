export type DouyinPublishVerdict = "可发" | "改完可发" | "高风险勿发"
export type DouyinPublishSeverity = "high" | "mid" | "low"

export interface DouyinPublishViolation {
  text: string
  severity: DouyinPublishSeverity
  category: string
  reason: string
  suggest: string
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
}

const RULES: Array<Omit<DouyinPublishViolation, "text"> & { words: string[] }> = [
  {
    category: "引流导流",
    severity: "high",
    words: ["私信我", "微信", "vx", "VX", "wx", "加群", "二维码", "主页找我", "看我主页"],
    reason: "非企业号引导站外联系或交易，容易触发限流/审核。",
    suggest: "改为站内动作，比如「评论区留言」「关注后看合集」。",
  },
  {
    category: "广告法绝对化",
    severity: "high",
    words: ["100%有效", "100%", "绝对", "必定", "永久", "万能", "零风险"],
    reason: "承诺绝对结果，属于高风险表达。",
    suggest: "改为「多数人反馈」「更大概率」「我个人实测」。",
  },
  {
    category: "广告法最高级",
    severity: "high",
    words: ["全网第一", "史上第一", "销量第一", "全国第一", "NO.1", "TOP1"],
    reason: "最高级/排名表达需要证明，发布前不建议保留。",
    suggest: "改为「我用下来很靠前」「主流选择之一」。",
  },
  {
    category: "知识类虚假宣传",
    severity: "mid",
    words: ["神器", "黑科技", "躺赚", "月入过万", "零成本创业", "无脑操作"],
    reason: "容易被判成夸大收益或虚假宣传。",
    suggest: "改为「实用工具」「提效明显」「适合入门」。",
  },
  {
    category: "AI能力夸大",
    severity: "high",
    words: ["100%替代", "全面取代人工", "让所有人失业", "彻底取代"],
    reason: "AI 替代焦虑营销风险高。",
    suggest: "改为「帮你减少重复工作」「辅助提效」。",
  },
]

const SAFE_CONTEXT_WORDS = ["最喜欢", "最好的人", "最伟大", "最开心", "最难忘"]

function includesSafeContext(text: string, word: string) {
  return SAFE_CONTEXT_WORDS.some((safe) => safe.includes(word) && text.includes(safe))
}

function buildMinimalRewrite(content: string, violations: DouyinPublishViolation[]) {
  let rewritten = content
  for (const violation of violations) {
    const replacement = violation.suggest.match(/「([^」]+)」/)?.[1] ?? "更稳妥的说法"
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

  if (violations.some((item) => item.severity === "high")) {
    score -= 25
    reasons.push("存在高风险发布表达，会明显拖累推荐。")
  }
  if (violations.some((item) => item.severity === "mid")) {
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
    level: score >= 80 ? "高" as const : score >= 60 ? "中" as const : "低" as const,
    reasons: reasons.length > 0 ? reasons.slice(0, 4) : ["钩子、收藏价值和互动承接较完整。"],
  }
}

function detectAiLabelReminder(content: string) {
  return /AI生成|AI写|AI配音|AI画面|AI数字人|AI剪辑|数字人/.test(content)
    ? "疑似含 AI 生成/辅助内容，发布端建议勾选 AI 标签，并在前 5 秒加「含 AI 生成内容」提示。"
    : "未发现明确 AI 生成内容声明；如实际使用 AI 画面、配音或数字人，仍需按平台要求标注。"
}

/**
 * @description 运行douyinpublishcheck
 * @param content - 内容
 * @returns DouyinPublishCheck
 */
export function runDouyinPublishCheck(content: string): DouyinPublishCheck {
  const violations: DouyinPublishViolation[] = []
  const seen = new Set<string>()

  for (const rule of RULES) {
    for (const word of rule.words) {
      if (!content.includes(word) || seen.has(word)) continue
      if ((word === "最" || word === "最佳" || word === "最优") && includesSafeContext(content, word)) continue
      violations.push({
        text: word,
        severity: rule.severity,
        category: rule.category,
        reason: rule.reason,
        suggest: rule.suggest,
      })
      seen.add(word)
    }
  }

  const highCount = violations.filter((item) => item.severity === "high").length
  const verdict: DouyinPublishVerdict = highCount >= 2
    ? "高风险勿发"
    : highCount > 0 || violations.length > 0
      ? "改完可发"
      : "可发"

  const trafficWeakness = detectTrafficWeakness(content)

  return {
    verdict,
    violations,
    aiLabelReminder: detectAiLabelReminder(content),
    trafficScore: scoreTrafficPotential(content, violations),
    trafficWeakness,
    minimalRewrite: buildMinimalRewrite(content, violations),
  }
}
