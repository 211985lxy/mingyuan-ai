import { env } from "@/env"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm"
import { getStyleProfileBlock } from "@/lib/style-profile"
import { getStylePromptBlock, STYLE_GUIDE_IDS, type StyleGuideId } from "@/lib/style-guide-config"
import { prisma } from "@/lib/prisma"

export const maxDuration = 60

const POLISH_MODEL = env.POLISH_MODEL || env.SCRIPT_POLISH_MODEL

// 文案禁用词黑名单（AI 味/营销黑话），各润色模式共用
const FORBIDDEN_TERMS =
  "赋能、闭环、抓手、颗粒度、对齐、拉通、打通、沉淀、复盘、迭代、链路、触达、心智、赛道"

/**
 * 读取项目知识库（老板经验/产品卖点/客户痛点/项目案例/客户问答），
 * 供 imitate 仿写模式填充新内容。从 aim-agents/script-agent.ts 迁移而来。
 */
async function loadProjectKnowledge(
  userId: string,
  projectId?: string
): Promise<string> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: {
      userId,
      status: "active",
      ...(projectId ? { OR: [{ projectId }, { projectId: null }] } : {}),
    },
    orderBy: { sortOrder: "asc" },
    take: 200,
  })

  if (entries.length === 0) return ""

  const CATEGORY_LABELS: Record<string, string> = {
    boss_experience: "老板经验",
    product_usp: "产品卖点",
    customer_pain: "客户痛点",
    project_case: "项目案例",
    customer_qa: "客户问答",
  }

  const grouped = new Map<string, typeof entries>()
  for (const entry of entries) {
    const list = grouped.get(entry.category) || []
    list.push(entry)
    grouped.set(entry.category, list)
  }

  let block = "\n=== 企业知识库 ===\n"
  for (const [category, items] of grouped) {
    block += `\n【${CATEGORY_LABELS[category] || category}】\n`
    for (const item of items) {
      block += `- ${item.title}：${item.content}\n`
    }
  }
  return block
}

export const POST = withUserAuth(async (request, { user }) => {
  const body = await request.json()
  const content = typeof body.content === "string" ? body.content.trim() : ""
  const weakDimensions = Array.isArray(body.weakDimensions) ? body.weakDimensions as string[] : []
  const topicTitle = typeof body.topicTitle === "string" ? body.topicTitle : null
  const persona = typeof body.persona === "string" ? body.persona : null
  const projectId =
    typeof body.projectId === "string" && body.projectId ? body.projectId : undefined
  const viralSourceText =
    typeof body.viralSourceText === "string" ? body.viralSourceText.trim() : ""
  const styleId =
    typeof body.styleId === "string" && (STYLE_GUIDE_IDS as string[]).includes(body.styleId)
      ? (body.styleId as StyleGuideId)
      : undefined
  const mode =
    body.mode === "proofread"
      ? "proofread"
      : body.mode === "imitate"
        ? "imitate"
        : "polish"

  if (!content || content.length < 30) {
    return NextResponse.json({ error: "文案内容不能为空" }, { status: 400 })
  }

  const llm = LLMClient.shared()
  if (!llm.available) {
    return NextResponse.json({ error: "AI 服务暂时不可用" }, { status: 503 })
  }

  // imitate 模式：跨行业爆款结构迁移——分析对标爆款的钩子/节奏/结尾逻辑，
  // 用当前 IP 的知识库和文风重写成同结构、本行业内容的新稿。
  if (mode === "imitate") {
    if (!viralSourceText || viralSourceText.length < 30) {
      return NextResponse.json({ error: "请提供对标爆款原文" }, { status: 400 })
    }
    if (!content || content.length < 30) {
      return NextResponse.json({ error: "草稿内容不能为空" }, { status: 400 })
    }

    // 用户级写作风格档案打底（项目内读项目风格）+ 可选 12 风格覆盖
    const [styleProfileBlock, knowledgeBlock] = await Promise.all([
      getStyleProfileBlock(user.id, projectId ?? null).catch(() => ""),
      loadProjectKnowledge(user.id, projectId),
    ])
    const styleOverrideBlock = getStylePromptBlock(styleId)

    const contextBlock = [
      knowledgeBlock,
      styleProfileBlock,
      persona ? `\nIP 人设：${persona}` : null,
    ]
      .filter(Boolean)
      .join("\n")

    const result = await llm.complete({
      model: POLISH_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是一个「爆款文案仿写专家」。你的任务是把一条对标爆款文案的底层结构逻辑，迁移到当前 IP 所在的行业，输出可直接使用的新稿。",
            "",
            contextBlock,
            "",
            "仿写规则：",
            "1. 先分析对标爆款的钩子类型、中段推进节奏、结尾收束方式。",
            "2. 保留爆款的钩子力度、情绪节奏和信息推进顺序，内容完全替换成当前 IP 行业的。",
            "3. 必须用上方企业知识库里的产品卖点、客户痛点、老板经验填充新内容；知识库没有的，基于草稿和 IP 人设合理补全，不要编造不存在的数据。",
            "4. 场景和细节必须是当前 IP 行业的真实场景，保持爆点力度。",
            "5. 严格贴合上方写作风格档案——仿写稿要像这个 IP 本人在说话，而不是通用的爆款腔。",
            `6. 禁止保留对标原文的行业特定词汇，全部替换；禁止使用：${FORBIDDEN_TERMS}。`,
            "7. 直接输出仿写成稿纯文本，不要解释分析过程，不要加格式标记。",
            styleOverrideBlock,
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "请把以下对标爆款的结构逻辑迁移到当前 IP，重写我的草稿：",
            "",
            "【对标爆款原文】",
            viralSourceText,
            "",
            "【我的草稿（行业/方向参考）】",
            content,
            ...(topicTitle ? [`\n选题方向：${topicTitle}`] : []),
            "",
            "直接输出仿写后的成稿：",
          ].join("\n"),
        },
      ],
      temperature: 0.7,
      maxTokens: 2000,
    })

    const polished = result.content
      .replace(/^【[^】]+】\s*/g, "")
      .replace(/^仿写后[：:]\s*/gi, "")
      .replace(/^修改后[：:]\s*/gi, "")
      .trim()

    if (!polished || polished.length < 30) {
      return NextResponse.json({ error: "仿写结果无效，请重试" }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        original: content,
        polished,
        polishedDimensions: styleId ? ["imitate", styleId] : ["imitate"],
      },
    })
  }

  if (mode === "proofread") {
    const result = await llm.complete({
      model: POLISH_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是一位中文文案校对编辑。",
            "只修正错别字、标点、明显语病、重复字词和不通顺的小问题。",
            "必须保持原文意思、结构、段落顺序、语气和表达风格不变。",
            "不要扩写，不要改标题，不要增加解释，不要输出修改说明。",
          ].join("\n"),
        },
        {
          role: "user",
          content: [
            "请轻量校对以下文案，直接输出校对后的纯文本：",
            "",
            content,
          ].join("\n"),
        },
      ],
      temperature: 0.1,
      maxTokens: 2000,
    })

    const polished = result.content
      .replace(/^校对后[：:]\s*/gi, "")
      .replace(/^修改后[：:]\s*/gi, "")
      .trim()

    if (!polished || polished.length < 30) {
      return NextResponse.json({ error: "校对结果无效，请重试" }, { status: 500 })
    }

    return NextResponse.json({
      data: {
        original: content,
        polished,
        polishedDimensions: ["proofread"],
      },
    })
  }

  // Build targeted polish instructions based on weak dimensions
  const polishInstructions: string[] = []

  if (weakDimensions.includes("aiTaste")) {
    polishInstructions.push(
      "【AI味消除——最高优先级】",
      "1. 逐段扫描，删除或替换以下禁用词：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
      "2. 打破排比三连——如果有三个以上相同句式连续出现，保留最有力的一个，其余改为不同句式。",
      "3. 把'首先...其次...最后...'改为口语过渡（比如'还有一点很关键'、'最让我意外的是'）。",
      "4. '不是...而是...'如果出现超过一次，只保留最有冲击力的一次，其余改成直接陈述。",
      "5. 加入1-2处真实感细节（具体数字、场景描述、个人感受），让文案像真人说的。",
    )
  }

  if (weakDimensions.includes("editorial")) {
    polishInstructions.push(
      "【编辑质量提升】",
      "1. 检查每句话是否有信息量——删掉纯凑字数的空话和废话。",
      "2. 确保前后逻辑连贯，不要跳跃——如果两段之间缺少过渡，加一句口语化衔接。",
      "3. 检查是否有错别字、语病或不通顺的表述，直接修正。",
    )
  }

  if (weakDimensions.includes("attraction")) {
    polishInstructions.push(
      "【吸引力提升】",
      "1. 前3秒（前15个字以内）必须有钩子——反常识、具体数字、直接挑战、或引发好奇的提问。",
      "2. 如果开头是'今天我们来聊...'、'大家好我是...'这类万能开场，必须改掉。",
      "3. 在文案中间加入至少一处'意料之外'的转折或反直觉表述。",
    )
  }

  if (weakDimensions.includes("logic")) {
    polishInstructions.push(
      "【逻辑性提升】",
      "1. 检查论点→论据→结论的链条是否完整，如果缺少论据支撑，补充一个具体案例或数据。",
      "2. 如果CTA和前面的论述脱节，加一句过渡让CTA显得自然。",
      "3. 确保每段话都在推进核心论点，不要跑题。",
    )
  }

  // Default: if no weak dimensions specified, do general polish
  if (polishInstructions.length === 0) {
    polishInstructions.push(
      "【综合润色】",
      "优化文案的口语化表达、去除AI味痕迹、增强开头吸引力和逻辑连贯性。",
    )
  }

    // 用户级写作风格档案（项目内读项目风格，无项目读全局）
    // projectId: projectId ?? null — 确保项目风格隔离
    const styleProfileBlock = await getStyleProfileBlock(user.id, projectId ?? null).catch(() => "")
    const contextSection = [
    topicTitle ? `选题方向：${topicTitle}` : null,
    persona ? `IP人设：${persona}` : null,
    styleProfileBlock ? `写作风格档案：\n${styleProfileBlock}` : null,
  ].filter(Boolean).join("\n")

  const result = await llm.complete({
    model: POLISH_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是一位短视频文案润色专家。你的任务是对用户给出的口播文案进行精准润色。",
          "",
          "核心原则：",
          "- 保持原文的核心意思和信息点不变",
          "- 保持原文的整体结构和段落顺序不变",
          "- 只修改需要优化的部分，不要全量重写",
          "- 润色后的文案必须可以直接朗读，像真人在跟镜头说话",
          "- 禁止添加任何解释、注释或结构标签",
          "",
          ...polishInstructions,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          contextSection ? `${contextSection}\n` : "",
          "请润色以下文案：\n",
          content,
          "",
          "直接输出润色后的文案纯文本，不要输出任何其他内容。",
        ].join("\n"),
      },
    ],
    temperature: 0.4,
    maxTokens: 2000,
  })

  const polished = result.content
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/^润色后[：:]\s*/gi, "")
    .replace(/^修改后[：:]\s*/gi, "")
    .trim()

  if (!polished || polished.length < 30) {
    return NextResponse.json({ error: "润色结果无效，请重试" }, { status: 500 })
  }

  return NextResponse.json({
    data: {
      original: content,
      polished,
      polishedDimensions: weakDimensions,
    },
  })
})
