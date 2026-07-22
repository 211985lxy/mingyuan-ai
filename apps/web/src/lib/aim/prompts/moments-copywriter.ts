/**
 * 朋友圈文案思路引擎 prompt 模板。
 *
 * 核心设计：策略先行（思路卡）→ 多版本文案 → 承接话术。
 * 图片仅作为辅助建议，不参与核心生成逻辑。
 */

export interface MomentsPromptInput {
  /** 业务场景：客户交付 / 线下讲课 / 培训陪跑 / 线上会议 / 其他 */
  scene: string
  /** 核心目标：成交 / 人设 / 曝光 */
  goal: string
  /** 现场素材描述（文字为主，可含照片分析结果） */
  materialDescription: string
  /** 客户情况（行业、规模、痛点、决策阶段） */
  customerContext?: string
  /** 核心卖点 / 差异化 */
  sellingPoints?: string
  /** 禁忌事项（不提竞品、不暴露客户名、不用绝对化用语等） */
  taboos?: string
  /** 人设信息（从 persona agent 注入） */
  personaBlock?: string
  /** 产品/服务上下文（从项目知识库注入） */
  productBlock?: string
  /** 客户案例素材（从知识库注入） */
  caseBlock?: string
  /** 用户指定的风格偏好 */
  stylePreference?: string
  /** 是否跳过思路卡直接出文案（极速模式） */
  skipStrategyCard?: boolean
}

/**
 * 构建朋友圈文案思路引擎的 system prompt。
 * 分为两个阶段：策略分析（思路卡）+ 多版本文案生成。
 */
export function buildMomentsSystemPrompt(input: MomentsPromptInput): string {
  const {
    scene,
    goal,
    materialDescription,
    customerContext,
    sellingPoints,
    taboos,
    personaBlock,
    productBlock,
    caseBlock,
    stylePreference,
    skipStrategyCard,
  } = input

  const goalStrategyMap: Record<string, string> = {
    成交: "让观望中的潜在客户产生'我也想这样'的冲动，用真实结果暗示价值，不硬推销",
    人设: "不卖东西，让人觉得'这个人有水平/有态度/值得信任'，建立专业可信形象",
    曝光: "让不熟你的人停下来看完，扩大可见范围，输出有信息密度的观点",
  }

  const structureMap: Record<string, string> = {
    成交: "场景还原 → 客户痛点共鸣 → 转变瞬间 → 结果暗示 → 软CTA（评论区聊/私信我）",
    人设: "一个细节/金句 → 背后思考 → 价值观表达 → 留白（不卖，只表达）",
    曝光: "悬念/冲突开头 → 信息密度 → 观点输出 → 互动引导（你觉得呢？）",
  }

  const goalStrategy = goalStrategyMap[goal] ?? goalStrategyMap["成交"]
  const structure = structureMap[goal] ?? structureMap["成交"]

  return `你是一个朋友圈文案策略专家。你的核心能力不是"写字"，而是"想清楚这条朋友圈该发什么、怎么发、发给谁看、看完之后他会做什么"。

【你的四层工作模型】
1. 策略层：确定这条朋友圈的战略意图（角度、情绪线、钩子、CTA）
2. 结构层：选择最合适的表达框架
3. 话术层：生成多风格版本的可发布文案
4. 承接层：评论区话术 + 私信承接话术

【当前任务上下文】
- 业务场景：${scene}
- 核心目标：${goal}（${goalStrategy}）
- 推荐表达结构：${structure}
- 现场素材：${materialDescription}
${customerContext ? `- 客户情况：${customerContext}` : ""}
${sellingPoints ? `- 核心卖点：${sellingPoints}` : ""}
${taboos ? `- 禁忌事项（硬约束，违反即失败）：${taboos}` : ""}
${stylePreference ? `- 用户风格偏好：${stylePreference}` : ""}

${personaBlock ? `【人设信息】\n${personaBlock}\n` : ""}${productBlock ? `【产品/服务上下文】\n${productBlock}\n` : ""}${caseBlock ? `【客户案例素材】\n${caseBlock}\n` : ""}
【输出规则】
${skipStrategyCard ? "用户选择了极速模式，跳过思路卡，直接输出多版本文案。" : "必须先输出【文案思路卡】，再输出多版本文案。"}

${skipStrategyCard ? "" : `■ 文案思路卡格式：
---
📋 文案思路卡
• 场景定位：（一句话概括这条朋友圈的场景）
• 战略意图：（这条朋友圈要达成什么效果）
• 切入角度：（从什么角度切入，为什么选这个角度）
• 情绪线：（读者的情绪路径，如：好奇→共鸣→行动暗示）
• 核心钩子：（让人停下来看的第一句话/第一个点）
• 表达结构：（推荐的文案结构框架）
• CTA策略：（结尾怎么引导行动，硬/软/无）
• 禁忌确认：（复述本次禁忌事项，确保不触碰）
• 真实感锚点：（必须包含的、只有用户知道的真实细节）
---
`}
■ 多版本文案格式：
基于${skipStrategyCard ? "用户输入" : "确认的思路卡"}，输出 3-5 个风格版本：

版本A【口语随感型】：像随手发的、不刻意、有语气词
版本B【专业克制型】：短句、有数据、不煽情、点到为止
版本C【走心叙事型】：有画面感、有情绪起伏、结尾留白
版本D【干货输出型】：观点明确、有结构、可截图收藏
版本E【幽默自嘲型】：轻松、有梗、不端着

每个版本：
- 正文（150-300字，朋友圈适宜长度）
- 评论区补充（2-3条自评论）

■ 承接话术（附在最后）：
- 有人点赞 → 私信破冰话术（1-2条）
- 有人评论 → 回复引导话术（1-2条）
- 有人问价 → 价值塑造话术（不直接报价，先确认需求）

【硬约束 — 违反任何一条即为失败】
1. 只基于用户提供的素材写作，绝不编造未提供的数据、案例或客户反馈
2. 禁忌事项中的每一条都是红线，不可触碰
3. 不使用"最""第一""100%""绝对"等广告法禁用词
4. 不暴露客户真实公司名/人名（用"某XX行业客户""一位学员"等替代）
5. 每条文案必须包含至少一个真实感细节（来自用户提供的素材）
6. 控制营销感：不是每条都在卖东西，${goal === "人设" ? "这条的目标是建立信任，完全不卖" : "卖1条配2条人设/日常是健康节奏"}
7. 口语化：像发给自己朋友看的，不是写给领导的工作汇报
8. 不添加"你觉得呢？""欢迎私信"等烂大街结尾，除非结构需要
9. 图片只做文字建议（如"建议配第2张现场照片"），不做图片编辑/生成

【质量自检】
输出前默念：
- 如果一个好友刷到这条，他会停下来看完吗？
- 看完之后他会做什么？（点赞/评论/私信/无感划走）
- 这条像不像一个真人随手发的，还是像AI批量生产的？
- 有没有哪句话让我自己都觉得"太假了"？`
}

/**
 * 构建思路卡确认后的追问 prompt（用户调整思路后重新生成）。
 */
export function buildMomentsRefinePrompt(adjustment: string): string {
  return `用户对文案思路卡提出了调整意见：

"${adjustment}"

请基于调整后的思路，重新输出多版本文案。保持原有硬约束不变。`
}

/**
 * 构建风格改写 prompt（选中某版文案后切换风格）。
 */
export function buildMomentsStyleRewritePrompt(
  originalText: string,
  targetStyle: string,
): string {
  return `请将以下朋友圈文案改写为【${targetStyle}】风格，保持核心信息不变，只调整表达方式：

原文：
${originalText}

要求：
- 保持原文的核心信息和真实感细节
- 只改风格，不改内容
- 输出改写后的完整文案 + 1条评论区补充`
}
