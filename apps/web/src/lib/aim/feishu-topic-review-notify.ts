// ─── 每日选题裁决卡：把 AI 提案推给运营者，由人决定用哪张 ─────────
// 复用「选题策划官」(business_diagnosis) 身份与每日推送通道（与热点简报同一开关/群）。
// 交互按钮回调到 /api/integrations/feishu/topic-card-actions。
// 设计前提：选题定生死 —— 卡片只负责把 AI 的提案、评分与依据摆清楚，采用权在人手里。

import { buildTopicDailyReport, type TopicDailyReport, type TopicDailyReportSource } from "@/lib/topic-daily-report"
import { readHotBriefingPushConfig } from "@/lib/aim/feishu-hot-briefing-notify"
import { resolveBotById } from "@/lib/feishu-agent-registry"
import { sendCardAsBot } from "@/lib/feishu-bot-identity"
import type { TopicCard } from "@/lib/topic-validation"
import type { ApiAiHotBriefingItem, ApiTopicCard } from "@/types/api"

const TOPIC_REVIEW_BOT_ID = "business_diagnosis"
/** 卡片上最多列几张候选，与生成批次一致；多出的仍留在记录里 */
export const TOPIC_REVIEW_CARD_LIMIT = 4

export interface TopicReviewCardInput {
  selectionId: string
  cards: TopicCard[]
  sources: TopicDailyReportSource[]
  briefingItems?: ApiAiHotBriefingItem[]
  projectName?: string | null
}

function scoreLabel(card: TopicCard) {
  return typeof card.score === "number" ? `｜${card.score} 分` : ""
}

const EDITOR_VERDICT_LABEL: Record<NonNullable<TopicCard["editorReview"]>["editorVerdict"], string> = {
  strong: "建议主推",
  usable: "可用",
  observe: "观察",
  revise: "建议改",
}

function editorMark(card: TopicCard) {
  const review = card.editorReview
  if (!review) return ""
  return `｜主编 ${review.editorScore}分｜${EDITOR_VERDICT_LABEL[review.editorVerdict]}`
}

/**
 * 生成产物是归一化后的 zod TopicCard，日报渲染器吃的是 API DTO。
 * 两者运行时同构（normalizeScoreBreakdown 保证五维分数为数字），差异只在静态类型，
 * 故在此边界做一次显式转换。
 */
function toApiCards(cards: TopicCard[]): ApiTopicCard[] {
  return cards as unknown as ApiTopicCard[]
}

/** 候选区：编号 + 标题 + 评分 + AI 主推标记 + 一句理由，便于人快速比较。 */
function buildCandidateLines(cards: TopicCard[], leadTitle: string | undefined) {
  return cards
    .slice(0, TOPIC_REVIEW_CARD_LIMIT)
    .map((card, index) => {
      const mark = card.title === leadTitle ? "｜AI 主推" : ""
      const why = card.editorReview?.editorReason || card.scoreReason || card.rationale || ""
      return `**${index + 1}. ${card.title}**${scoreLabel(card)}${mark}${editorMark(card)}\n${why}`
    })
    .join("\n\n")
}

/** 依据区：按项目/客户/对标/热点分组，只列标题，说明「AI 为什么这么提」。 */
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

function buildReferenceSection(links: ReferenceLink[]): Record<string, unknown> | null {
  if (links.length === 0) return null
  const lines = links.map((link) => `- [${link.label}](${link.url})`).join("\n")
  return {
    tag: "div",
    text: { tag: "lark_md", content: `**参考素材**（点开原视频对照）\n${lines}` },
  }
}

/** 采用按钮按候选序号铺开，另加「换一批」与「都不行」。 */
function buildActionButtons(selectionId: string, candidateCount: number) {
  const base = { topic_selection_id: selectionId }
  const adoptButtons = Array.from({ length: candidateCount }, (_, index) => ({
    tag: "button",
    text: { tag: "plain_text", content: `采用 ${index + 1}` },
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

/**
 * @description 构建选题裁决卡（AI 提案 + 评分理由 + 依据 + 人工裁决按钮）
 * @param input - 选题记录 ID、候选卡、来源快照、热门条目、项目名
 * @returns 飞书交互卡片对象
 */
export function buildTopicReviewCard(input: TopicReviewCardInput): Record<string, unknown> {
  const cards = input.cards.slice(0, TOPIC_REVIEW_CARD_LIMIT)
  const report = buildTopicDailyReport(toApiCards(input.cards), input.briefingItems ?? [], "daily", input.sources)
  const evidenceLines = buildEvidenceLines(report)
  const referenceLinks = extractReferenceLinks(input.sources)
  const referenceSection = buildReferenceSection(referenceLinks)

  return {
    config: { wide_screen_mode: true },
    header: {
      title: { tag: "plain_text", content: "今日选题 · 请你裁决" },
      template: "blue",
    },
    elements: [
      {
        tag: "div",
        text: {
          tag: "lark_md",
          content: [
            input.projectName ? `**项目**：${input.projectName}` : "",
            `**AI 结论**：${report.conclusion}`,
            report.leadCard?.editorReview?.editorReason
              ? `**主编结论**：${report.leadCard.editorReview.editorReason}`
              : "",
            `**判断理由**：${report.reason}`,
          ].filter(Boolean).join("\n"),
        },
      },
      { tag: "hr" },
      {
        tag: "div",
        text: { tag: "lark_md", content: buildCandidateLines(cards, report.leadCard?.title) },
      },
      ...(evidenceLines.length > 0
        ? [
            { tag: "hr" },
            {
              tag: "div",
              text: { tag: "lark_md", content: `**判断依据**\n${evidenceLines.join("\n")}` },
            },
          ]
        : []),
      ...(referenceSection ? [{ tag: "hr" }, referenceSection] : []),
      { tag: "action", actions: buildActionButtons(input.selectionId, cards.length) },
      {
        tag: "note",
        elements: [
          {
            tag: "plain_text",
            content: "AI 只做提案与评分；采用哪张由你决定。「都不行」进观察池，候选不会丢。",
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
