/**
 * 抖音发布前规则卡（P0）
 *
 * 运行时只加载短摘要，不塞官网全文。
 * 判定铁律：违规 = 越线表达 + 危险绑定；词面命中只是候选。
 * 出处参考星图/平台规范口径（核验基线 2026-07），不承诺过审。
 */

export type PublishPrecheckSeverity = "high" | "mid" | "low"

export interface PublishPrecheckRule {
  id: string
  title: string
  category: string
  severity: PublishPrecheckSeverity
  /** 词面召回 */
  surfaceTerms: string[]
  /** 危险绑定线索；空数组表示见词即可进入语境复核（仍可因安全语境清空） */
  bindHints: string[]
  /** 什么情况不算违规（给人看 / 写进 evidence） */
  clearedWhen: string
  reason: string
  suggest: string
  /** 替换用的稳妥说法（取 suggest 里「」亦可；显式更稳） */
  replaceWith: string
  sourceNote: string
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
]
