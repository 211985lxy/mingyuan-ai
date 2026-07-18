import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { getAgentLLM } from "@/lib/llm/agent-router"
import {
  buildLocalChecklist,
  checkEmojiDensity,
  checkXhsTitle,
  findAbsoluteTerms,
  parseXhsReviewPayload,
  parseXhsVariantsPayload,
  XHS_CHECKLIST_LABELS,
  type XhsChecklistItem,
} from "@/lib/xhs-review"

export const maxDuration = 60

const XHS_MODEL = process.env.XHS_REVIEW_MODEL || process.env.POLISH_MODEL

/**
 * POST /api/scripts/xhs-review
 * 小红书图文编辑辅助（P2），走 editor_text 链。
 * 方法论内化自 rednote-director-skill：封面强钩子、内页递进、文案短狠清晰、
 * 自检清单（封面钩子/手机端可读性/信息层级/风格统一/收藏价值/避免模板感/
 * 避免文字堆积/emoji 克制）。
 *
 * body: { title?: string, content: string, mode: "review" | "variants" }
 *
 * mode=review 响应：
 *   { data: { score, issues: [{type, text, suggestion}], checklist: [{item, status, note}], emojiDensity } }
 *   - 确定性维度（本地）：emoji 克制 / 绝对化用语 / 标题长度 / 文字堆积
 *   - LLM 定性维度：封面钩子 / 可读性 / 信息层级 / 风格统一 / 收藏价值 / 模板感
 * mode=variants 响应：
 *   { data: { titles: string[]（5-8 条）, hooks: string[]（3-5 条）, tags: string[] } }
 */
export const POST = withUserAuth(async (request) => {
  const body = await request.json()
  const content = typeof body.content === "string" ? body.content.trim() : ""
  const title = typeof body.title === "string" ? body.title.trim() : ""
  const mode = body.mode === "variants" ? "variants" : "review"

  if (!content || content.length < 10) {
    return NextResponse.json({ error: "笔记内容太短，请先写一些正文" }, { status: 400 })
  }

  const llm = getAgentLLM("editor_text")
  if (!llm.available) {
    return NextResponse.json({ error: "AI 服务暂时不可用" }, { status: 503 })
  }

  // ── 标题/钩子/标签变体 ──
  if (mode === "variants") {
    const result = await llm.complete({
      model: XHS_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是小红书爆款标题专家。基于用户正文，产出小红书风格的标题、首句钩子与话题标签变体。",
            "方法论：封面强钩子决定点击率；文案要短、狠、清晰；标题给足候选让用户挑。",
            "要求：",
            "1. titles：5-8 条标题，每条 ≤20 字（不含 emoji），带 1-2 个相关 emoji，在「数字结果型/痛点提问型/身份共鸣型/反常识型」中混合。",
            "2. hooks：3-5 条首句钩子，每条 ≤30 字，能直接当正文第一句，制造好奇或反差。",
            "3. tags：5-8 个话题标签（不含 # 号），贴合小红书搜索习惯，大词与精准长尾词混合。",
            "4. 不得使用广告法绝对化用语（最/第一/国家级等）。",
            '5. 严格输出 JSON：{"titles": [...], "hooks": [...], "tags": [...]}，不要输出任何其他内容。',
          ].join("\n"),
        },
        { role: "user", content: `正文如下：\n\n${content.slice(0, 2000)}` },
      ],
      temperature: 0.8,
      maxTokens: 1000,
    })

    const variants = parseXhsVariantsPayload(result.content)
    if (variants.titles.length === 0 && variants.hooks.length === 0) {
      return NextResponse.json({ error: "标题生成失败，请重试" }, { status: 500 })
    }
    return NextResponse.json({ data: variants })
  }

  // ── 风格检查 ──
  // 1) 确定性检查（本地，不消耗 token）
  const { density, issue: emojiIssue } = checkEmojiDensity(content)
  const absoluteIssues = findAbsoluteTerms(content)
  const titleIssue = title ? checkXhsTitle(title) : null
  const deterministicIssues = [
    ...(emojiIssue ? [emojiIssue] : []),
    ...absoluteIssues,
    ...(titleIssue ? [titleIssue] : []),
  ]
  const localChecklist = buildLocalChecklist(title, content)
  const localItems = new Set(localChecklist.map((item) => item.item))

  // 2) LLM 检查：定性维度（封面钩子/可读性/层级/风格/收藏/模板感）+ 口语化
  const qualitativeLabels = Object.entries(XHS_CHECKLIST_LABELS)
    .filter(([key]) => !localItems.has(key))
    .map(([key, label]) => `${key}（${label}）`)
    .join("、")

  const result = await llm.complete({
    model: XHS_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是小红书内容审核编辑，按成熟图文笔记方法论审稿。",
          "方法论：封面（首行）必须是强钩子；内页信息递进；文案短、狠、清晰；避免 PPT 式模板感与大段文字堆积。",
          "评分标准：0-100，80 分以上为可直接发布水平。",
          "检查项：",
          "1. spoken 口语化：是否像真人分享（书面腔/AI 腔要扣分并指出具体句子）。",
          "2. hook 封面钩子：首行/标题是否有点击欲（人群+结果+钩子是否齐备）。",
          "3. readability 手机端可读性：句子是否短、扫读是否顺畅。",
          "4. hierarchy 信息层级：重点是否突出、是否有递进。",
          "5. collection 收藏价值：是否给了可保存的干货（清单/步骤/模板）。",
          "6. template 模板感：是否像套话/PPT 文案。",
          "7. 结尾是否有评论区互动引导。",
          "注意：emoji 密度、广告法违禁词、标题长度、文字堆积已由系统检查，不要重复报告。",
          '严格输出 JSON：{"score": 数字, "issues": [{"type": "spoken|hook|readability|hierarchy|collection|template|structure", "text": "问题描述", "suggestion": "修改建议"}], "checklist": [{"item": "hook|readability|hierarchy|style|collection|template", "status": "pass|warn|fail", "note": "一句话说明"}]}。',
          `checklist 必须覆盖这些维度：${qualitativeLabels}。没有问题 issues 给空数组。不要输出任何其他内容。`,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          title ? `标题：${title}` : "（未提供标题）",
          "",
          "正文：",
          content.slice(0, 3000),
        ].join("\n"),
      },
    ],
    temperature: 0.2,
    maxTokens: 1500,
  })

  const llmReview = parseXhsReviewPayload(result.content)
  // 合并：确定性问题排前面（更硬），LLM 问题在后；checklist = 本地确定性项 + LLM 定性项
  const issues = [...deterministicIssues, ...llmReview.issues]
  const checklist: XhsChecklistItem[] = [
    ...localChecklist,
    ...llmReview.checklist.filter((item) => !localItems.has(item.item)),
  ]
  const score =
    llmReview.score > 0
      ? llmReview.score
      : Math.max(40, 90 - issues.length * 10)

  return NextResponse.json({
    data: { score, issues, checklist, emojiDensity: density },
  })
})
