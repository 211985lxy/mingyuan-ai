import { getAgentLLM } from "@/lib/llm/agent-router"
import { REVIEW_VERDICTS, type TopicCard } from "@/lib/topic-validation"

export const COMPETITOR_EVIDENCE_LIMIT = 8

export interface CompetitorViralEvidence {
  account: string
  title: string
  likes: number
  comments: number
  shares: number
  collects: number
}

export interface TopicEditorReviewContext {
  projectName?: string | null
  competitorEvidence?: CompetitorViralEvidence[]
}

export interface TopicEditorReviewerInput {
  systemPrompt: string
  userPrompt: string
}

export type TopicEditorReviewer = (input: TopicEditorReviewerInput) => Promise<string>

export type WatchAccountEvidenceInput = {
  nickname: string | null
  targetUrl: string
  viralVideos: unknown
  latestVideos?: unknown
}

type ParsedEditorReview = NonNullable<TopicCard["editorReview"]> & { title: string }

function heatOf(item: CompetitorViralEvidence): number {
  return item.likes + item.comments + item.shares + item.collects
}

function asFiniteNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

function readVideo(raw: unknown, account: string): CompetitorViralEvidence | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const title = typeof item.title === "string" ? item.title.trim() : ""
  if (!title) return null
  return {
    account,
    title,
    likes: asFiniteNumber(item.likes),
    comments: asFiniteNumber(item.comments),
    shares: asFiniteNumber(item.shares),
    collects: asFiniteNumber(item.collects),
  }
}

function collectAccountVideos(account: WatchAccountEvidenceInput): CompetitorViralEvidence[] {
  const name = account.nickname?.trim() || account.targetUrl
  const videos = [
    ...(Array.isArray(account.viralVideos) ? account.viralVideos : []),
    ...(Array.isArray(account.latestVideos) ? account.latestVideos : []),
  ]
  return videos
    .map((video) => readVideo(video, name))
    .filter((item): item is CompetitorViralEvidence => item !== null)
}

export function selectTopCompetitorEvidence(
  accounts: WatchAccountEvidenceInput[],
  limit = COMPETITOR_EVIDENCE_LIMIT,
): CompetitorViralEvidence[] {
  const seen = new Set<string>()
  const pool: CompetitorViralEvidence[] = []
  for (const item of accounts.flatMap(collectAccountVideos)) {
    const key = `${item.account}::${item.title}`
    if (seen.has(key)) continue
    seen.add(key)
    pool.push(item)
  }
  return pool.sort((a, b) => heatOf(b) - heatOf(a)).slice(0, limit)
}

export function formatCompetitorEvidenceBlock(evidence: CompetitorViralEvidence[]): string {
  if (evidence.length === 0) {
    return "无对标验证数据。传播钩子不得给高分，不得臆测播放量。"
  }
  return [
    "对标验证数据（真实赞/评/转/藏，以此为准，不得臆测播放量）：",
    ...evidence.map(
      (item, index) =>
        `${index + 1}. ${item.account}｜${item.title}｜赞${item.likes} 评${item.comments} 转${item.shares} 藏${item.collects}`,
    ),
  ].join("\n")
}

export function buildEditorReviewSystemPrompt(): string {
  return [
    "你是一位严苛的短视频主编。你只做评审，不出题，不改写标题。",
    "用挑剔口吻逐张打分。高分必须能站住脚，宁严勿松。",
    "评审维度：项目契合、内容价值、传播钩子、转化、可行性、陌生化含金量。",
    "传播潜力必须能追溯到某条真实对标母题的数据；无法追溯的不得给高分，不得臆测播放量。",
    "没有陌生化就没有含金量：novelty 弱的卡片必须压分。",
    "只输出 json 本身，不要解释文字、不要代码块。",
    `结构：{"reviews":[{"title":"与候选标题完全一致","editorScore":0到100整数,"editorVerdict":"${REVIEW_VERDICTS.join("|")}","editorReason":"一句话，点明对标追溯或说明无法追溯"}]}`,
    "reviews 必须覆盖全部候选，title 必须与输入标题完全一致。",
  ].join("\n")
}

function formatCardForReview(card: TopicCard, index: number): string {
  const novelty = card.defamiliarization
    ? `陌生化=${card.defamiliarization.scarcityType ?? "无"}/${card.defamiliarization.rhetoric ?? "无"}/含金量${card.defamiliarization.noveltyScore ?? "无"}；${card.defamiliarization.note ?? ""}`
    : "陌生化未提供"
  return [
    `候选${index + 1}：${card.title}`,
    `模型自评分=${card.score ?? "无"}｜判定=${card.reviewVerdict ?? "无"}`,
    `理由：${card.scoreReason || card.rationale || "无"}`,
    `钩子：${card.hook || "无"}`,
    novelty,
  ].join("\n")
}

export function buildEditorReviewUserPrompt(
  cards: TopicCard[],
  context: TopicEditorReviewContext,
): string {
  const project = context.projectName?.trim() ? `项目：${context.projectName.trim()}` : "项目：未提供"
  return [
    project,
    "",
    formatCompetitorEvidenceBlock(context.competitorEvidence ?? []),
    "",
    "待评审候选：",
    ...cards.map((card, index) => formatCardForReview(card, index)),
    "",
    "请只输出 json，不要代码块、不要解释文字。",
  ].join("\n")
}

function clampScore(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(100, Math.round(value)))
}

function parseOneReview(raw: unknown): ParsedEditorReview | null {
  if (!raw || typeof raw !== "object") return null
  const item = raw as Record<string, unknown>
  const title = typeof item.title === "string" ? item.title.trim() : ""
  const editorScore = clampScore(item.editorScore)
  const editorVerdict = typeof item.editorVerdict === "string" ? item.editorVerdict : ""
  const editorReason = typeof item.editorReason === "string" ? item.editorReason.trim().slice(0, 200) : ""
  if (!title || editorScore === null || !(REVIEW_VERDICTS as readonly string[]).includes(editorVerdict) || editorReason.length < 2) {
    return null
  }
  return {
    title,
    editorScore,
    editorVerdict: editorVerdict as ParsedEditorReview["editorVerdict"],
    editorReason,
  }
}

function extractReviews(raw: string): ParsedEditorReview[] {
  try {
    const payload = JSON.parse(raw.trim()) as { reviews?: unknown }
    if (!Array.isArray(payload.reviews)) return []
    return payload.reviews.map(parseOneReview).filter((item): item is ParsedEditorReview => item !== null)
  } catch {
    return []
  }
}

function attachReviews(cards: TopicCard[], reviews: ParsedEditorReview[]): TopicCard[] {
  const byTitle = new Map(reviews.map((item) => [item.title, item]))
  return cards.map((card) => {
    const review = byTitle.get(card.title)
    if (!review) return card
    return {
      ...card,
      editorReview: {
        editorScore: review.editorScore,
        editorVerdict: review.editorVerdict,
        editorReason: review.editorReason,
      },
    }
  })
}

async function defaultReviewer(input: TopicEditorReviewerInput): Promise<string> {
  const llm = getAgentLLM("business_diagnosis")
  const result = await llm.complete({
    messages: [
      { role: "system", content: input.systemPrompt },
      { role: "user", content: input.userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 1600,
    responseFormat: { type: "json_object" },
  })
  return result.content
}

export async function evaluateTopicCards(
  cards: TopicCard[],
  context: TopicEditorReviewContext = {},
  reviewer: TopicEditorReviewer = defaultReviewer,
): Promise<TopicCard[]> {
  if (cards.length === 0) return cards
  try {
    const reviews = extractReviews(
      await reviewer({
        systemPrompt: buildEditorReviewSystemPrompt(),
        userPrompt: buildEditorReviewUserPrompt(cards, context),
      }),
    )
    if (reviews.length === 0) return cards
    return attachReviews(cards, reviews)
  } catch {
    return cards
  }
}
