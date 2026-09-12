// ─── 每日选题裁决卡：把 AI 提案推给运营者，由人决定用哪张 ─────────
// 复用「选题策划官」(business_diagnosis) 身份与每日推送通道（与热点简报同一开关/群）。
// 交互按钮回调到 /api/integrations/feishu/topic-card-actions。
// 设计前提：选题定生死 —— 卡片只负责把 AI 的提案、评分与依据摆清楚，采用权在人手里。
//
// 排版原则（避免一屏半的密文字）：
//   默认可见 = 概要一行 + 4 个候选（标题/主编判定/理由）+ 按钮
//   折叠收起 = 结论与理由全文、判断依据、参考素材

import { buildTopicDailyReport, type TopicDailyReport, type TopicDailyReportSource } from "@/lib/topic-daily-report"
import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"
import type { TopicCard } from "@/lib/topic-validation"
import type { ApiAiHotBriefingItem, ApiTopicCard } from "@/types/api"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"
/** 卡片上最多列几张候选，与生成批次一致；多出的仍留在记录里 */
export const TOPIC_REVIEW_CARD_LIMIT = 4
/** 主编分与模型自评分岔超过该阈值时把模型分也标出来——真实分歧值得人注意 */
const SCORE_DIVERGENCE_THRESHOLD = 15

export interface TopicReviewCardInput {
  selectionId: string
  cards: TopicCard[]
  sources: TopicDailyReportSource[]
  briefingItems?: ApiAiHotBriefingItem[]
  projectName?: string | null
}

const EDITOR_VERDICT_LABEL: Record<NonNullable<TopicCard["editorReview"]>["editorVerdict"], string> = {
  strong: "值得拍",
  usable: "能拍",
  observe: "再想想",
  revise: "得改改",
}

/** 候选的元数据行：主编意见为主，分歧显著时附模型自评。 */
function candidateMeta(card: TopicCard): string {
  const review = card.editorReview
  if (!review) {
    return typeof card.score === "number" ? `模型 ${card.score}` : "还没评"
  }
  const parts = [`主编 ${review.editorScore} · ${EDITOR_VERDICT_LABEL[review.editorVerdict]}`]
  if (typeof card.score === "number" && Math.abs(card.score - review.editorScore) >= SCORE_DIVERGENCE_THRESHOLD) {
    parts.push(`模型 ${card.score}`)
  }
  return parts.join("　")
}

/**
 * 生成产物是归一化后的 zod TopicCard，日报渲染器吃的是 API DTO。
 * 两者运行时同构（normalizeScoreBreakdown 保证五维分数为数字），差异只在静态类型，
 * 故在此边界做一次显式转换。
 */
function toApiCards(cards: TopicCard[]): ApiTopicCard[] {
  return cards as unknown as ApiTopicCard[]
}

/** 候选区：标题 → 主编意见 → 理由三行一组，标题加粗作视觉锚点。 */
function buildCandidateLines(cards: TopicCard[], leadTitle: string | undefined) {
  return cards
    .slice(0, TOPIC_REVIEW_CARD_LIMIT)
    .map((card, index) => {
      const mark = card.title === leadTitle ? "　★首推" : ""
      const why = card.editorReview?.editorReason || card.scoreReason || card.rationale || ""
      return `**${index + 1}. ${card.title}**${mark}\n${candidateMeta(card)}\n${why}`
    })
    .join("\n\n")
}

/** 概要区：最推荐一行 + 项目一行，替代原来四行的结论块。 */
function buildSummaryLine(report: TopicDailyReport, projectName?: string | null) {
  const lead = report.leadCard
  const head = lead
    ? `**最推荐**：${lead.title}`
    : "**最推荐**：这批没挑出合适的"
  return [head, projectName ? `项目：${projectName}` : ""].filter(Boolean).join("\n")
}

/** 判断依据：按项目/客户/对标/热点分组，只列标题。 */
function buildEvidenceLines(report: TopicDailyReport) {
  return report.evidenceGroups
    .slice(0, 3)
    .map((group) => `**${group.label}**：${group.items.map((item) => item.title).join("、")}`)
}

export interface ReferenceLink {
  label: string
  url: string
}

/** 从来源文本里抓 `来源：URL` / `来源账号：URL` / `原片：URL` 行。 */
function extractUrlLine(content: string, marker: string): string | null {
  const match = content.match(new RegExp(`${marker}(https?://\\S+)`))
  return match ? match[1] : null
}

/**
 * 参考素材区：本批选题借鉴的原视频与对标账号，让人能点开原片对照。
 * - 拆解文案的 `来源：URL` 是真实的对标原视频（最相关，排前）
 * - 对标账号的 `来源账号：URL` 是账号主页；`原片：URL` 是其热度最高的作品
 * 每类去重、限量，防止卡片无限拉长。
 */
export function extractReferenceLinks(sources: TopicDailyReportSource[]): ReferenceLink[] {
  const links: ReferenceLink[] = []
  const seen = new Set<string>()

  for (const source of sources) {
    if (source.category !== "benchmark_reference") continue
    const original = extractUrlLine(source.content, "来源：")
    if (original && !seen.has(original)) {
      seen.add(original)
      links.push({ label: source.title, url: original })
    }
  }
  for (const source of sources) {
    if (source.category !== "benchmark_reference") continue
    for (const marker of ["原片：", "来源账号："] as const) {
      const url = extractUrlLine(source.content, marker)
      if (!url || seen.has(url)) continue
      seen.add(url)
      const label = marker === "原片："
        ? `${source.title}｜爆款原片`
        : `${source.title}｜账号主页`
      links.push({ label, url })
    }
  }
  return links.slice(0, 8)
}

/**
 * 折叠面板：把次要信息收起，卡片默认只留裁决所需内容。
 * expanded=false 让面板默认合上；点标题才展开。
 */
function buildCollapsiblePanel(title: string, blocks: string[]): Record<string, unknown> | null {
  const content = blocks.filter(Boolean)
  if (content.length === 0) return null
  return {
    tag: "collapsible_panel",
    expanded: false,
    header: {
      title: { tag: "plain_text", content: title },
      vertical_align: "center",
      icon: { tag: "standard_icon", token: "down-small-ccm_outlined", size: "16px 16px" },
      icon_position: "right",
      icon_expanded_angle: -180,
    },
    elements: content.map((text) => ({
      tag: "div",
      text: { tag: "lark_md", content: text },
    })),
  }
}

/** 选片按钮按候选序号铺开，另加「换一批」与「都不行」。 */
function buildActionButtons(selectionId: string, candidateCount: number) {
  const base = { topic_selection_id: selectionId }
  const adoptButtons = Array.from({ length: candidateCount }, (_, index) => ({
    tag: "button",
    text: { tag: "plain_text", content: `选 ${index + 1}` },
    type: "primary",
    value: { ...base, topic_action: "adopt", topic_index: index },
  }))
  return [
    ...adoptButtons,
    {
      tag: "button",
      text: { tag: "plain_text", content: "换一批" },
      type: "default",
      value: { ...base, topic_action: "regenerate" },
    },
    {
      tag: "button",
      text: { tag: "plain_text", content: "都不行" },
      type: "danger",
      value: { ...base, topic_action: "reject" },
    },
  ]
}

/** 结论面板：AI 的想法、主编点评、打分时怎么想的。 */
function buildConclusionPanel(report: TopicDailyReport): Record<string, unknown> | null {
  const leadReview = report.leadCard?.editorReview
  return buildCollapsiblePanel("为什么推这个", [
    `**AI 的想法**：${report.conclusion}`,
    leadReview ? `**主编点评**：${leadReview.editorReason}` : "",
    `**打分依据**：${report.reason}`,
  ])
}

/** 依据面板：参考来源 + 可点开的对标原片与账号主页。 */
function buildEvidencePanel(
  report: TopicDailyReport,
  referenceLinks: ReferenceLink[],
): Record<string, unknown> | null {
  const evidenceLines = buildEvidenceLines(report)
  const referenceBlock = referenceLinks.length > 0
    ? `**可以点开看看**\n${referenceLinks.map((link) => `- [${link.label}](${link.url})`).join("\n")}`
    : ""
  return buildCollapsiblePanel("参考了什么", [
    evidenceLines.length > 0 ? evidenceLines.join("\n") : "",
    referenceBlock,
  ])
}

/**
 * @description 构建选题卡（概要 + 候选 + 选择按钮，次要信息折叠）
 * @param input - 选题记录 ID、候选卡、来源快照、热门条目、项目名
 * @returns 飞书交互卡片对象
 */
export function buildTopicReviewCard(input: TopicReviewCardInput): Record<string, unknown> {
  const cards = input.cards.slice(0, TOPIC_REVIEW_CARD_LIMIT)
  const report = buildTopicDailyReport(toApiCards(input.cards), input.briefingItems ?? [], "daily", input.sources)
  const panels = [
    buildConclusionPanel(report),
    buildEvidencePanel(report, extractReferenceLinks(input.sources)),
  ].filter((panel): panel is Record<string, unknown> => panel !== null)

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "今日选题 · 你挑一个" },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: { tag: "lark_md", content: buildSummaryLine(report, input.projectName) },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: { tag: "lark_md", content: buildCandidateLines(cards, report.leadCard?.title) },
      },
      { tag: "action", actions: buildActionButtons(input.selectionId, cards.length) },
      ...panels,
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "AI 只负责出主意，拍哪个你说了算。点「都不行」也不会丢，先帮你存着。",
          },
        ],
      },
    ],
  }
}

/**
 * @description 把选题裁决卡推送到每日推送群（开关关闭或凭证不全时静默跳过）
 * @returns 推送结果；失败原因可供 cron 记录
 */
export async function sendTopicReviewToFeishu(
  input: TopicReviewCardInput,
): Promise<{ sent: boolean; reason?: string }> {
  const config = readHotBriefingPushConfig()
  if (!config.enabled) {
    return { sent: false, reason: "推送未启用（AIM_HOT_BRIEFING_PUSH_ENABLED 非 true）" }
  }

  const bot = resolveBotById(TOPIC_REVIEW_BOT_ID)
  if (!bot) {
    return { sent: false, reason: "选题策划官凭证未配置（FEISHU_BOT_TOPIC_PLANNER_* 不全）" }
  }

  const cardJson = JSON.stringify(buildTopicReviewCard(input))
  await sendCardAsBot({
    bot,
    chatId: config.chatId,
    cardJson,
    // 同一批选题只推一次，避免重试造成重复卡片
    idempotencyKey: `topic-review-${input.selectionId}`,
  })
  return { sent: true }
}
