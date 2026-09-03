/**
 * 抖音发布前规则卡（P0）
 *
 * 运行时只加载短摘要，不塞官网全文。
 * 判定铁律：违规 = 越线表达 + 危险绑定；词面命中只是候选。
 * 出处参考星图/平台规范口径（核验基线 2026-07），不承诺过审。
 */

/** 兼容基线：旧规则用 mid，Task 10 新规则按用户规格用 medium；判定时等价。 */
export type PublishPrecheckSeverity = "high" | "mid" | "medium" | "low"

export interface PublishPrecheckRuleClearedWhen {
  terms?: string[]
}

export interface PublishPrecheckRule {
  id: string
  title: string
  category: string
  severity: PublishPrecheckSeverity
  /** 词面召回 */
  surfaceTerms: string[]
  /** 危险绑定线索；空数组表示见词即可进入语境复核（仍可因安全语境清空） */
  bindHints: string[]
  /**
   * 什么情况不算违规：
   *  - 字符串形式：给人看 / 写进 evidence 的描述
   *  - 对象形式 { terms: string[] }：命中任一豁免关键词即清空（程序化判定）
   */
  clearedWhen: string | PublishPrecheckRuleClearedWhen
  reason: string
  suggest: string
  /** 替换用的稳妥说法（统一回退字符串，或 surfaceTerm -> 建议替换 的字典） */
  replaceWith: string | Record<string, string>
  sourceNote: string
  /** 子条件/命中词或条件数组（可选扩展位） */
  rules?: (string | Record<string, unknown>)[]
}

/** 个人经历 / 安全语境：命中这些短语时，弱化绝对化与「最」类误伤 */
export const SAFE_CONTEXT_PHRASES = [
  "最喜欢",
  "最好的人",
  "最伟大",
  "最开心",
  "最难忘",
  "我用过最",
  "我个人觉得最",
] as const

/** 转化 / 站外动作绑定（商业危险绑定） */
export const COMMERCIAL_BIND_HINTS = [
  "买课",
  "下单",
  "加微信",
  "加我微信",
  "加我",
  "私信我",
  "私信",
  "vx",
  "VX",
  "wx",
  "扫码",
  "二维码",
  "进群",
  "加群",
  "训练营",
  "咨询报名",
  "点击链接",
  "链接下单",
  "下方下单",
  "主页找我",
  "看我主页",
] as const

/** 收益/效果确定性用词 */
export const CERTAINTY_HINTS = [
  "保证",
  "稳赚",
  "必定",
  "一定",
  "肯定",
  "包治",
  "根治",
  "零风险",
  "100%",
] as const

export const PUBLISH_PRECHECK_DISCLAIMER =
  "本检查只覆盖可见表达风险，不承诺平台一定过审；账号权重与内部模型无法预判。"

export const PUBLISH_PRECHECK_RECHECK_HINT =
  "改完后请再点一次「发布前自查」做复检。"

/**
 * P0 商业规则卡：R01–R05 + 保留原 AI 夸大条目。
 * JUDGE 尺度写在判定函数注释与 clearedWhen 中，不单独成卡。
 */
export const PUBLISH_PRECHECK_RULES: PublishPrecheckRule[] = [
  {
    id: "R01",
    title: "绝对化用语",
    category: "广告法最高级",
    severity: "high",
    surfaceTerms: [
      "全网第一",
      "史上第一",
      "销量第一",
      "全国第一",
      "NO.1",
      "TOP1",
      "最好",
      "唯一",
      "全网最",
    ],
    bindHints: [...COMMERCIAL_BIND_HINTS, "神器", "产品", "课程", "方案", "AI"],
    clearedWhen: "明确限定个人体验（如「我用过最顺手」），且无转化引导",
    reason: "商业语境下的最高级/排名表达需要证明，发布前不建议保留。",
    suggest: "改为「我用下来很靠前」「主流选择之一」。",
    replaceWith: "我用下来很靠前",
    sourceNote: "星图短视频内容制作规范 · 绝对化用语",
  },
  {
    id: "R02",
    title: "不可考证话术",
    category: "广告法绝对化",
    severity: "high",
    surfaceTerms: [
      "100%有效",
      "100%",
      "绝对",
      "永久",
      "万能",
      "零风险",
      "国家级",
      "纯天然",
      "无副作用",
    ],
    bindHints: [...COMMERCIAL_BIND_HINTS, ...CERTAINTY_HINTS, "有效", "功效", "效果"],
    clearedWhen: "客观描述步骤次数等非产品优越性，或无商业转化",
    reason: "无法考证的绝对结果承诺，属于高风险表达。",
    suggest: "改为「多数人反馈」「更大概率」「我个人实测」。",
    replaceWith: "我个人实测",
    sourceNote: "星图短视频内容制作规范 · 不可考证话术",
  },
  {
    id: "R03",
    title: "收益保证",
    category: "收益承诺",
    severity: "high",
    surfaceTerms: [
      "稳赚",
      "躺赚",
      "月入过万",
      "保证回本",
      "保证收益",
      "一定回本",
      "肯定回本",
      "零成本创业",
    ],
    bindHints: [...COMMERCIAL_BIND_HINTS, ...CERTAINTY_HINTS, "回本", "赚钱", "收入", "成交"],
    clearedWhen: "仅陈述个人/学员真实经历数字，无确定性承诺且无付费转化绑定",
    reason: "向受众承诺可复制收益或回本，属于极高风险。",
    suggest: "改为「我个人那段时间的结果」「过程因人而异，别当承诺」。",
    replaceWith: "我个人那段时间的结果，因人而异",
    sourceNote: "星图短视频内容制作规范 · 收益保证",
  },
  {
    id: "R04",
    title: "效果保证",
    category: "功效承诺",
    severity: "high",
    surfaceTerms: [
      "瘦了八斤",
      "瘦八斤",
      "根治",
      "包治百病",
      "特效药",
      "几天见效",
      "一周见效",
      "两周见效",
    ],
    bindHints: [...COMMERCIAL_BIND_HINTS, ...CERTAINTY_HINTS, "瘦", "功效", "效果", "疗程"],
    clearedWhen: "只描述过程或有边界的个人体验，不把期限与确定功效绑定给受众",
    reason: "固定期限绑定确定功效并向受众承诺结果，发布风险高。",
    suggest: "改为过程描述，并说明效果因人而异；不要打包票。",
    replaceWith: "个人体验因人而异，我不打包票",
    sourceNote: "星图短视频内容制作规范 · 效果保证",
  },
  {
    id: "R05",
    title: "站外引流",
    category: "引流导流",
    severity: "high",
    surfaceTerms: [
      "私信我",
      "加微信",
      "加我微信",
      "加我 vx",
      "加我vx",
      "vx",
      "VX",
      "wx",
      "加群",
      "二维码",
      "主页找我",
      "看我主页",
      "扫码",
    ],
    bindHints: [
      "加",
      "私信",
      "微信",
      "vx",
      "扫",
      "进群",
      "领取",
      "下单",
      "买课",
      "咨询",
    ],
    clearedWhen: "仅提及平台站内组件/同生态工具，未布置站外联系或交易动作",
    reason: "引导站外联系或交易，容易触发限流或审核。",
    suggest: "改为站内动作，比如「评论区留言」「关注后看合集」。",
    replaceWith: "评论区留言",
    sourceNote: "抖音规则中心 / 星图 · 站外引流",
  },
  {
    id: "R06",
    title: "夸张卖点（中风险）",
    category: "知识类虚假宣传",
    severity: "mid",
    surfaceTerms: ["神器", "黑科技", "无脑操作"],
    bindHints: [...COMMERCIAL_BIND_HINTS, "课程", "产品", "工具", "AI"],
    clearedWhen: "口语比喻且无转化绑定",
    reason: "容易被判成夸大宣传，建议降调。",
    suggest: "改为「实用工具」「提效明显」「适合入门」。",
    replaceWith: "实用工具",
    sourceNote: "平台商业表达常见风控口径",
  },
  {
    id: "R07",
    title: "AI 能力夸大",
    category: "AI能力夸大",
    severity: "high",
    surfaceTerms: ["100%替代", "全面取代人工", "让所有人失业", "彻底取代"],
    bindHints: ["AI", "人工", "失业", "替代", ...COMMERCIAL_BIND_HINTS],
    clearedWhen: "明确说辅助提效、不宣称全面取代",
    reason: "AI 替代焦虑营销风险高。",
    suggest: "改为「帮你减少重复工作」「辅助提效」。",
    replaceWith: "帮你减少重复工作",
    sourceNote: "产品侧发布风险约定",
  },
  {
    id: "R06_brand_tool_word",
    title: "直接点名第三方 AI 工具品牌词",
    category: "平台限流风险",
    severity: "medium",
    surfaceTerms: ["即梦", "豆包", "文心一言", "通义千问", "可灵", "Kling", "剪映", "Capcut"],
    bindHints: [],
    clearedWhen: { terms: ["AI 工具", "某厂工具", "通用大模型", "第三方工具"] },
    reason: "平台算法对直接点名竞品/第三方工具品牌的内容存在隐形限流，尤其工具品牌词露出时容易打上「导流」标签。",
    suggest: "用泛称指代，如「AI 工具」/「某厂工具」/「通用大模型」。",
    replaceWith: { 即梦: "AI 视频工具", 豆包: "AI 对话工具", 文心一言: "通用大模型", 通义千问: "通用大模型", 可灵: "AI 动画工具", Kling: "AI 视频工具", 剪映: "剪辑工具", Capcut: "剪辑工具" },
    sourceNote: "竹子文档第七节踩坑经验 1：点名即梦、豆包等工具后，流量明显低于同量级作品。",
  },
  {
    id: "R07_ai_generated_material_flag",
    title: "含 AI 生成素材但未主动标注「AI 创作」声明",
    category: "平台标注要求",
    severity: "low",
    surfaceTerms: ["AI 图", "AI生成图", "AI 生成图", "即梦图", "豆包图", "用 AI 生成的图", "AI画的", "AI 作画", "Seedream 生成", "即梦生成", "Midjourney", "Stable Diffusion 生成"],
    bindHints: [],
    clearedWhen: { terms: ["本视频含 AI 创作", "标注：AI 生成", "AI 生成标注", "声明：本片内容含 AI 辅助创作", "素材部分由 AI 生成"] },
    reason: "主流平台当前对 AI 生成素材均有标注要求，主动标注通常不影响流量，但未标注时可能触发降权或审核打回。",
    suggest: "建议在文案开头、结尾或视频显著位置声明「本视频含 AI 创作」/「标注：AI 生成」。主动标注不影响流量，反而是更安全的做法。",
    replaceWith: "声明：本片内容含 AI 辅助创作",
    sourceNote: "竹子文档第七节踩坑经验 2：部分账号在使用 AI 生成素材未标注时，收到平台审核打回或限流提醒。",
  },
  {
    id: "R08_batch_account_wording",
    title: "批量生产内容 / 批量做账号 / 矩阵号类措辞",
    category: "封号高危",
    severity: "high",
    surfaceTerms: ["批量生产内容", "批量做账号", "矩阵号", "群发账号", "一台手机做 100 个号", "批量养号", "矩阵账号", "一人百号"],
    bindHints: [],
    clearedWhen: {},
    reason: "平台对「批量内容工厂 / 矩阵号」有专项打击，已出现实锤封号案例，尤其是提到批量养号或一人多号的措辞。",
    suggest: "合规化表达建议：「内容团队协作」/「多账号运营」/「跨平台分发管理」。强调人的创作参与，而不是机器流水线批量。",
    replaceWith: "内容团队协作 / 多账号运营",
    sourceNote: "竹子文档第七节踩坑经验 3（实锤封号案例：某账号标题写「批量做 100 号」→ 次日全号封禁）。",
  },
  {
    id: "R09_commercial_content_channel",
    title: "商单内容（赞助/广告/合作/植入）未走平台合作通道",
    category: "商单合规",
    severity: "medium",
    surfaceTerms: ["赞助", "广告合作", "品牌合作", "植入", "合作推广", "冠名", "商务合作", "品牌方赞助", "本视频由", "感谢以下品牌"],
    bindHints: [],
    clearedWhen: { terms: ["星图", "蒲公英", "聚量千川", "巨量星图", "品牌合作平台", "内容合作平台报备"] },
    reason: "商单内容不走平台报备通道，可能触发平台抽取佣金或直接下架处罚，返点议价空间也会丢失。",
    suggest: "商单统一走平台合作通道（星图/蒲公英/聚量等），在平台上签约并走官方报备流程。价格上预留 20-30% 返点空间（渠道 + 平台）。",
    replaceWith: "本内容已通过品牌合作平台报备",
    sourceNote: "竹子文档第七节踩坑经验 4：一笔 1.8 万商单未走星图，最终被平台扣下 60% 服务费。",
  },
]

/** 仅 P0 商业基线（R01–R05 + R06 夸张卖点 + R07 AI 能力夸大，即原 PUBLISH_PRECHECK_RULES 中的老条目） */
export const BASELINE_PUBLISH_PRECHECK_RULE_IDS = [
  "R01",
  "R02",
  "R03",
  "R04",
  "R05",
  "R06",
  "R07",
] as const

/** Task 10 新增加的合规额外规则（R06_* ~ R09_*）ID 集合；随 complianceExtraRules 开关生效 */
export const EXTRA_COMPLIANCE_RULE_IDS = [
  "R06_brand_tool_word",
  "R07_ai_generated_material_flag",
  "R08_batch_account_wording",
  "R09_commercial_content_channel",
] as const

/** 命中结果单条 */
export interface PublishPrecheckHit {
  ruleId: string
  title: string
  category: string
  severity: PublishPrecheckSeverity
  matchedTerm: string
  reason: string
  suggest: string
  sourceNote: string
}

/** 归一化 severity，mid 与 medium 对外等价。 */
export function normalizeSeverity(s: PublishPrecheckSeverity): "high" | "medium" | "low" {
  if (s === "mid") return "medium"
  return s
}

/** 取 clearedWhen 中的豁免关键词列表（如有）。 */
export function getClearedTerms(rule: PublishPrecheckRule): string[] {
  if (typeof rule.clearedWhen === "object" && rule.clearedWhen && Array.isArray(rule.clearedWhen.terms)) {
    return rule.clearedWhen.terms
  }
  return []
}

/**
 * 根据 complianceExtraRules 开关筛选规则：
 *  - false: 只加载 P0 基线（R01–R05 + 已有的夸张/AI夸大）
 *  - true:  9 条全跑（基线 5 + 夸张/夸大 2 + Task10 新 4）
 */
export function filterRulesByComplianceSwitch(
  rules: PublishPrecheckRule[],
  complianceExtraRules: boolean,
): PublishPrecheckRule[] {
  if (complianceExtraRules) return rules
  const baselineIds = new Set<string>([...BASELINE_PUBLISH_PRECHECK_RULE_IDS])
  return rules.filter((r) => baselineIds.has(r.id))
}

/**
 * 执行发布前规则检查的轻量版（文本词面 + 豁免 clearedWhen.terms）。
 * 与 douyin-publish-check 中更重的「危险绑定」判定解耦：douyin 复用 PUBLISH_PRECHECK_RULES
 * 对象自己跑判定，而这里是给 xhs-review / 单测使用的文本级命中器。
 */
export function runPublishPrecheck(
  text: string,
  complianceExtraRules = false,
  opts: { rules?: PublishPrecheckRule[] } = {},
): PublishPrecheckHit[] {
  const baseRules = opts.rules ?? PUBLISH_PRECHECK_RULES
  const rules = filterRulesByComplianceSwitch(baseRules, complianceExtraRules)
  const hits: PublishPrecheckHit[] = []
  const seen = new Set<string>()

  for (const rule of rules) {
    const sortedTerms = [...rule.surfaceTerms].sort((a, b) => b.length - a.length)
    const matchedTerms: string[] = []
    for (const term of sortedTerms) {
      if (text.includes(term)) matchedTerms.push(term)
    }
    if (matchedTerms.length === 0) continue

    // 豁免：命中 clearedWhen.terms 任一即豁免
    const clearedTerms = getClearedTerms(rule)
    const isCleared = clearedTerms.length > 0 && clearedTerms.some((t) => text.includes(t))
    if (isCleared) continue

    // 每个规则只记一次（去重），取最长命中词作为 evidence
    if (seen.has(rule.id)) continue
    seen.add(rule.id)
    const matched = matchedTerms[0] ?? ""
    hits.push({
      ruleId: rule.id,
      title: rule.title,
      category: rule.category,
      severity: normalizeSeverity(rule.severity),
      matchedTerm: matched,
      reason: rule.reason,
      suggest: rule.suggest,
      sourceNote: rule.sourceNote,
    })
  }

  return hits
}

