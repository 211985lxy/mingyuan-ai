import { VALID_TOPIC_SOURCE_TYPES, VALID_TOPIC_TYPES } from "@/lib/topic-validation"
import type { DerivationStrategy } from "@/lib/topic-element-logic"
import type { RecommendationMode, TopicGenerationInput } from "./contracts"

const TOPIC_SOURCE_LABELS: Record<string, string> = {
  daily_inspiration: "日常灵感",
  meeting_minutes: "会议纪要",
  benchmark_reference: "对标参考",
  user_insight: "用户洞察",
  boss_experience: "老板经验",
  product_usp: "产品卖点",
  customer_pain: "客户痛点",
  project_case: "成交案例",
  customer_qa: "客户问答",
  client_project: "IP操作方案基准线",
  industry_hot: "行业热点",
}

export function truncateTopicSourceContent(content: string): string {
  const normalized = content.replace(/\s+/g, " ").trim()
  return normalized.length <= 180 ? normalized : `${normalized.slice(0, 180)}...`
}

export function buildTopicSystemPrompt(
  strategy: DerivationStrategy,
  recentTitles: string[],
  recommendationMode: RecommendationMode = "normal",
): string {
  const basePrompt = `你是一位短视频选题策划专家，精通用户心理和内容运营。你的任务是根据 IP 档案和指定的营销元素，生成4个差异化的短视频选题。

输出要求：
- 严格返回 JSON 格式，结构为 {"topics": [card1, card2, card3, card4]}
- 每张卡片包含：title (选题标题，2-20字), elementCodes (使用的元素代码数组), openingTypeCode (推荐开场类型代码), structureCode (推荐文案结构代码), rationale (一句话理由，20-60字), topicType, sourceType, score, scoreReason, scoreBreakdown, reviewVerdict, revisionAdvice
- topicType 必须从以下选择：${VALID_TOPIC_TYPES.join("、")}
- sourceType 必须从以下选择：${VALID_TOPIC_SOURCE_TYPES.join("、")}
- scoreBreakdown 必须包含五个 0-100 整数：projectFit(客户/项目匹配度，权重25), contentValue(内容价值，权重25), viralHook(传播钩子，权重20), conversionFit(成交关联，权重15), feasibility(执行可行性，权重15)
- score 为 0-100 的整数，由五维加权得出；scoreReason 用一句话说明评分原因
- reviewVerdict 必须从 strong、usable、observe、revise 选择；任一维度低于40必须为 revise；revisionAdvice 必须给出具体修改指令
- 4个选题必须标题各不相同，角度各异
- 如果提供了账号内容线，至少1个选题必须贴合某条内容线，并在 contentLine 字段填写该内容线的名称（如"职场干货"）；未提供内容线时 contentLine 留空
- openingTypeCode 必须从以下选择：curiosity_open, leverage_open, pain_open, extreme_open, fear_open, contrast_open, benefit_open
- structureCode 必须从以下选择：suspense_reveal, contrast_hook, three_beat_ramp, proof_first, pain_solution, pov_walkthrough, objection_dialogue, before_after, universal
- 开场类型和文案结构的推荐要与选题内容和使用的元素逻辑匹配

【陌生化含金量（选题的硬指标）】没有陌生化的选题是没有含金量的，每张卡片必须给出 defamiliarization：
- scarcityType（稀缺类型，6 选 1）：scenery=稀缺景观（没见过的大海/特殊视觉效果）、emotion=稀缺情感（特别饱满的情感）、beauty=稀缺美好（极其稀有的美好品质）、info=稀缺信息资讯（财经博主式稀缺信息）、curio=稀缺奇闻异事（说书号/电影号式奇闻）、event=稀缺事件（婆媳剑拔弩张/街头抓眼球/稀缺故事）
- rhetoric（赋比兴手法，3 选 1）：fu=赋（平铺直叙、铺陈堆叠，演绎细节之美）、bi=比（以彼物比此物，并置/对立/结合之美）、xing=兴（先言他物引起所咏，转化之美）
- noveltyScore（含金量分，0-100 整数）：素材可遇不可求的程度 × 表达手法的陌生度，宁低勿凑数
- note（一句话"凭什么陌生"）：说明这条选题具体靠什么制造陌生，20-60字`
  const strategies: Record<DerivationStrategy, string> = {
    fresh: `
选题差异化策略：
1. 第1张：最安全、最容易引起共鸣的角度
2. 第2张：有反差感或新奇度的角度
3. 第3张：聚焦实用干货或方法论的角度
4. 第4张：情感驱动或故事化的角度`,
    adjacent: `
选题差异化策略（邻域探索模式）：
你正在帮用户从一个已有方向延伸出新角度。保留核心元素的基调，但换一个切入点。
1. 第1张：从用户视角出发的痛点切入
2. 第2张：从行业内幕/专业知识切入
3. 第3张：从具体场景/案例切入
4. 第4张：从时效性/季节性/趋势切入
每个选题要像是"同一棵树的不同分支"，而不是完全不同的树。`,
    niche: `
选题差异化策略（纵深挖掘模式）：
用户已经看过宽泛的选题了，现在需要更垂直、更细分、更具体的角度。
把大选题拆成小选题，把通用建议变成具体场景。
1. 第1张：针对特定人群细分（比如"新手"、"老手"、"被坑过的人"）
2. 第2张：针对特定场景细分（比如"夏天"、"装修前"、"搬新家"）
3. 第3张：针对特定问题细分（比如"最贵的那个坑"、"最容易忽略的点"）
4. 第4张：争议性/反常识的细分角度（比如"其实不需要XXX"、"90%的人搞反了"）
每个标题要足够具体，让用户一看就知道讲的是什么场景。`,
    remix: `
选题差异化策略（跨界混搭模式）：
用户已经看过几组选题了。现在需要把不同维度的元素重新组合，产生化学反应。
1. 第1张：把"信任"和"实用"结合，做一个有干货有说服力的选题
2. 第2张：把"情感"和"对比"结合，做一个有冲击力的选题
3. 第3张：把"好奇"和"故事"结合，做一个让人想看完的选题
4. 第4张：出其不意的组合，打破用户的预期
每个选题应该让用户觉得"这个角度我没想到，但确实有道理"。`,
  }
  let prompt = basePrompt + strategies[strategy]
  if (recommendationMode === "daily") {
    prompt += `\n\n【今日推荐模式】推荐优先级固定为：当前账号资料/资料库 > 对标账号/对标文案 > 行业热点/AI HOT。只把最近 24 小时热点作为时效线索，热点只能作为行业线索和时效角度，不要让通用 AI 热点覆盖账号本身的行业、客户和产品。评分维度固定为：账号适配度、转化价值、流量潜力、素材支撑、执行难度。每张卡片优先补充 hook（开头钩子）、angle（展开角度）、cta（结尾行动），并按热点类、人设类、问题解答类、观点类的口径组织。`
  } else if (recommendationMode === "weekly") {
    prompt += `\n\n【本周选题模式】生成一组适合作为本周内容池的选题，账号资料、对标账号、对标文案和资料库内容优先，热点只作为角度参考，不要过度依赖单日新闻。评分维度固定为：账号适配度、转化价值、流量潜力、素材支撑、执行难度，并按热点类、人设类、问题解答类、观点类的口径组织。`
  }
  if (recentTitles.length > 0) {
    prompt += `\n\n【去重要求】以下选题用户已经看过了，请务必避免相同或高度相似的标题：\n${recentTitles.map((title, index) => `${index + 1}. ${title}`).join("\n")}\n生成的4个标题不能与上述标题语义重复。`
  }
  return prompt
}

export function buildTopicUserPrompt(input: TopicGenerationInput, selectedCodes: string[]): string {
  const { ipProfile, topicSources, recommendationMode = "normal", contentThemes } = input
  const selectedElements = input.elements.filter((element) => selectedCodes.includes(element.code))
  const profileSection = ipProfile?.promptSnapshot
    ? `## IP 档案\n${ipProfile.promptSnapshot}`
    : ipProfile
      ? ["## IP 档案", ipProfile.displayName && `- 名称：${ipProfile.displayName}`, ipProfile.industry && `- 行业：${ipProfile.industry}`, ipProfile.primaryOffer && `- 核心产品/服务：${ipProfile.primaryOffer}`, ipProfile.targetAudience && `- 目标受众：${ipProfile.targetAudience}`, ipProfile.ipTraits && `- IP 特质：${ipProfile.ipTraits}`, ipProfile.toneOfVoice && `- 说话风格：${ipProfile.toneOfVoice}`, ipProfile.proofPoints && `- 信任背书：${ipProfile.proofPoints}`, ipProfile.callToAction && `- 行动号召：${ipProfile.callToAction}`].filter(Boolean).join("\n")
      : ""
  const sourceSection = !topicSources?.length
    ? ""
    : ["## 本次选题素材", ...topicSources.map((source) => `- ${TOPIC_SOURCE_LABELS[source.category] ?? "补充素材"}：${source.title}\n  ${truncateTopicSourceContent(source.content)}`)].join("\n")
  const contentThemeSection = contentThemes?.length
    ? `## 账号内容线\n${contentThemes.map((theme) => `- ${theme.name}（占比 ${Math.round(theme.ratio * 100)}%）`).join("\n")}\n\n至少生成1个贴合某条内容线的选题，并在 contentLine 字段标出名称。`
    : ""
  const elementSection = [`## 本次使用的营销元素 (${selectedCodes.length}个)`, ...selectedElements.map((element) => `- **${element.name}** (${element.code}): ${element.description}`)].join("\n")
  const benchmarkInstruction = topicSources?.some((source) => source.category === "benchmark_reference")
    ? `## 对标优先规则
本次选题必须优先借助对标账号和对标文案作为重要信息来源。
- 至少 2 张选题要能追溯到对标信号：选题母题、开头钩子、结构节奏、用户痛点、情绪推进或转化设计。
- 对标参考只能迁移"母题、结构和钩子"，不能照抄标题、原句或原行业模板。
- 如果同时提供 AI HOT 或行业热点，它们只能补充时效角度，不能覆盖对标主线。
- 每个借鉴对标的选题，都要在 rationale 或 angle 中体现：这个 IP 应该怎么开头、旧认知怎么改、方法模块怎么迁移、结尾如何承接自己的产品。`
    : ""
  const projectInstruction = profileSection || topicSources?.some((source) => source.category === "client_project")
    ? `## IP操作方案基准线
全站选题策划必须先对齐整体 IP 操作方案或客户项目全案，再使用其他素材。
- 先校验目标客户、主产品/服务、成交路径、交付目标和账号定位，选题不能偏离这条主线。
- 热点、会议纪要、对标、问卷和采访清单只是素材来源，用来补充钩子、证据、真实问题和执行动作，不能覆盖基准线。
- 如果某个素材很热但和 IP 操作方案不匹配，请降低 projectFit 和 conversionFit，不要硬推荐。`
    : ""
  const sourcePriorityInstruction = topicSources?.length
    ? `## 来源权重
在不偏离 IP 操作方案基准线的前提下，选题来源权重按以下顺序执行：
- 第一优先：对标账号、对标文案拆解。
- 第二优先：行业热点 / AI HOT。
- 第三优先：知识库资料、会议纪要、用户洞察等内部素材。
- 如果高优先级来源已经足够支撑选题，不要再用低优先级素材把角度拉回普通知识库总结。`
    : ""
  const meetingMinutesInstruction = topicSources?.some((source) => source.category === "meeting_minutes")
    ? `## 会议纪要参与规则
本次素材包含会议纪要。请把会议纪要作为真实业务语料参与选题，但不要默认压过其他资料。
- 问题解答类可从会议里的真实问题、客户原话、分歧、案例、客户顾虑和下一步动作中提炼。
- 转化类仍要结合产品卖点、项目案例和成交承接；人设类仍要结合老板经历和定位素材；热点类仍要结合行业信源和对标动态。
- 如果某张选题来自会议纪要，请在 rationale 或 angle 中点明对应的会议问题或原话。`
    : ""
  const modeInstruction = recommendationMode === "daily" ? "这是今日推荐，请优先考虑当天能发、能拍、能承接的选题。" : recommendationMode === "weekly" ? "这是本周选题池，请兼顾人设、转化和流量。" : ""
  const sections = [profileSection, contentThemeSection, sourceSection, projectInstruction, sourcePriorityInstruction, benchmarkInstruction, meetingMinutesInstruction, elementSection].filter(Boolean)
  return `${sections.join("\n\n")}\n\n请基于以上${profileSection ? " IP 档案、" : ""}${sourceSection ? "选题素材和" : ""}营销元素，生成4个差异化的短视频选题卡片。每个选题都要巧妙融入指定的营销元素，并推荐最匹配的开场类型和文案结构。${modeInstruction}`
}
