/**
 * 内容场景配置模块
 *
 * 在 content_producer 智能体内，通过「场景模式」注入差异化指令和知识策略，
 * 而非拆分成多个独立智能体。每个场景定义了专属的提示块、知识调用策略和品控重点。
 */

// ─── 场景枚举 ────────────────────────────────────────────
export type ContentScenario =
  | "ip_knowledge"
  | "entity_local"
  | "traffic_conversion"
  | "xhs_planting"
  | "kol_explore"

// ─── 场景中文标签 ────────────────────────────────────────
export const SCENARIO_LABELS: Record<ContentScenario, string> = {
  ip_knowledge: "IP知识类口播",
  entity_local: "本地商家获客",
  traffic_conversion: "付费流量转化",
  xhs_planting: "小红书种草",
  kol_explore: "KOL探店评测",
}

// ─── 场景配置接口 ────────────────────────────────────────
export interface ScenarioConfig {
  /** 注入到系统提示中的场景专属指令块 */
  promptBlock: string
  /** 知识库调用策略标识 */
  knowledgeStrategy: string
  /** 品控审核重点 */
  qualityFocus: string
}

// ─── 场景完整配置 ────────────────────────────────────────
export const SCENARIO_CONFIGS: Record<ContentScenario, ScenarioConfig> = {
  ip_knowledge: {
    promptBlock: [
      "【IP知识类口播模式】",
      "你的核心任务：基于老板/IP的专业知识储备，产出一段有信息增量的口播脚本。",
      "- 开头第一句优先给反常识观点或令人意外的事实，打破惯性思维",
      "- 论点尽量落到具体案例或真实场景；没有真实案例就用群体场景描述，不编造",
      "- 口语化表达，去掉书面语和长句",
      "- 结尾用一个押韵或对比式的金句收束，方便用户截图或转发",
      "- 语感要求：像一个经验丰富的同行在茶桌上跟你聊天，不要播音腔",
      "语气基调：专业但不端着，有洞察力但不居高临下。",
    ].join("\n"),
    knowledgeStrategy: "persona",
    qualityFocus: "信息增量、案例真实性、口语化程度",
  },

  entity_local: {
    promptBlock: [
      "【本地商家获客模式】",
      "你的核心任务：为本地生活商家创作一段能直接带来到店客流或私信咨询的内容。",
      "- 标题和封面文字必须包含具体地名+品类词，让同城用户一眼识别关联性",
      "- 前3秒抛出一个本地用户真实痛点（排队、踩坑、选择困难），引发共鸣",
      "- 用「体验者视角」写，不要写成商家广告；细节越具体越可信",
      "- 必须在结尾给出明确的行动引导：到店报暗号、私信领取优惠、评论区留言",
      "- 植入可感知的细节（口味、环境、价格、服务），让用户产生画面感",
      "语气基调：真实体验分享，像朋友推荐好店，不夸张不虚假。",
    ].join("\n"),
    knowledgeStrategy: "conversion",
    qualityFocus: "同城关联度、行动引导明确性、体验细节可信度",
  },

  traffic_conversion: {
    promptBlock: [
      "【付费流量转化模式】",
      "你的核心任务：为付费投流场景创作高转化率文案，每一秒都在为CTA服务。",
      "- 前3秒必须用利益点或悬念留住用户，禁止任何形式的自我介绍式开头",
      "- 文案结构严格遵循「痛点→方案→信任证据→CTA」四段式，不得跳步",
      "- CTA按钮文案必须具体可执行（立即领取/点击下单/免费试用），禁止模糊指令",
      "- 价格信息用对比锚定法呈现（原价→活动价），制造紧迫感但不做虚假宣传",
      "- 每一句话都要回答用户心中「这跟我有什么关系」的问题，不写废话",
      "语气基调：高效利落，像一个懂行的朋友在帮你做购买决策。",
    ].join("\n"),
    knowledgeStrategy: "conversion",
    qualityFocus: "3秒留存率、CTA明确性、转化逻辑完整性",
  },

  xhs_planting: {
    promptBlock: [
      "【小红书种草模式】",
      "你的核心任务：创作符合小红书社区调性的种草笔记，让用户看完就想买。",
      "- 标题包含品类关键词+情绪词或数字，保持简短",
      "- 正文开头用一个「真实使用场景」切入，让用户产生代入感",
      "- 如对比同类产品，用具体参数或体感佐证本品优势",
      "- 使用表情符号分隔段落，保持视觉节奏感，但每段不超过3行",
      "- 结尾用开放式提问引导粉丝互动（你在用什么？评论区告诉我），并在结尾给出「值得收藏/回看」的理由（如步骤清单、参数对比、避坑要点），提升收藏与复访",
      "语气基调：真诚分享、小激动但不浮夸，像闺蜜安利好物。",
    ].join("\n"),
    knowledgeStrategy: "traffic",
    qualityFocus: "社区调性匹配度、互动引导自然度、卖点可感知性",
  },

  kol_explore: {
    promptBlock: [
      "【KOL探店评测模式】",
      "你的核心任务：为达人探店视频创作脚本，打造沉浸式体验叙事。",
      "- 开场用感官爆点切入（第一口的味道、推门瞬间的氛围、视觉冲击），3秒内拉住观众",
      "- 按照体验时间线叙事：进门→观察→品尝→评价，制造真实的探店节奏感",
      "- 每个推荐点必须配一个可拍摄的具体画面指令（特写、全景、慢镜头），方便执行",
      "- 可设置「反转时刻」（预期差、意外惊喜、隐藏菜单）增强记忆点",
      "- 评分或总结环节要量化（打分制、排名制），给观众清晰的选择参考",
      "语气基调：热情但不做作，像一个真正热爱美食/生活的达人。",
    ].join("\n"),
    knowledgeStrategy: "deep",
    qualityFocus: "感官爆点强度、可拍摄性、叙事节奏感",
  },
}

// ─── 工具函数 ──────────────────────────────────────────

/** 获取指定场景的完整配置 */
/**
 * @description 获取scenarioconfig
 * @param scenario - scenario
 * @returns ScenarioConfig
 */
export function getScenarioConfig(scenario: ContentScenario): ScenarioConfig {
  return SCENARIO_CONFIGS[scenario]
}

/** 构建场景提示块，若场景为 undefined 则返回空字符串 */
/**
 * @description 构建scenariopromptblock
 * @param scenario? - scenario?
 * @returns string
 */
export function buildScenarioPromptBlock(
  scenario?: ContentScenario,
): string {
  if (!scenario) return ""
  return SCENARIO_CONFIGS[scenario].promptBlock
}
