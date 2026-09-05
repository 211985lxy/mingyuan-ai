/**
 * 周报四段式长文生成（WP-D 移交项 · 岗位卡复盘官输出格式）。
 *
 * 四段式：一 已确认的数据事实 / 二 基于数据的判断 / 三 暂时不能确定的原因 / 四 下一轮建议。
 * 纪律：
 * - 事实段由本模块从结构化真源逐条拼出，数字与 JSON 完全一致；LLM 只补写二/三/四段。
 * - 全空数据周不出假报告（显式「本周期无已回填数据」）。
 * - 样本不足（任一聚合 sampleNote / 发布 <3）时，建议段必须包含「继续积累数据」，不下硬结论。
 * - 相关≠因果；空值≠0；7/14/30 为累计快照差值口径，不相加。
 * - 产物是自动初稿，客户可见前必须人审（100% 人审红线）。
 */

import { LLMClient } from "@/lib/llm/client"
import type { WeeklyReviewMetrics } from "@/lib/aim/weekly-review"
import type { TaskAttributionInsight } from "@/lib/aim/attribution-insights"

export interface WeeklyNarrativeInput {
  review: WeeklyReviewMetrics
  taskInsights: TaskAttributionInsight[]
}

export interface WeeklyNarrativeLlm {
  complete(options: {
    messages: Array<{ role: "user" | "system" | "assistant"; content: string }>
    temperature?: number
    maxTokens?: number
  }): Promise<{ content: string; finishReason?: string | null }>
}

export type WeeklyNarrative = {
  /** llm=三段由模型补写；template=模板保守初稿（LLM 失败/校验不过）；empty=无数据不出报告 */
  source: "llm" | "template" | "empty"
  markdown: string
  generatedAt: string
  /** source=template 时的回退原因，如实可见 */
  fallbackReason?: string
}

const SECTION_HEADERS = ["## 二、基于数据的判断", "## 三、暂时不能确定的原因", "## 四、下一轮建议"]

function periodLabel(review: WeeklyReviewMetrics): string {
  const start = review.periodStart.slice(0, 10)
  const end = new Date(new Date(review.periodEnd).getTime() - 1).toISOString().slice(0, 10)
  return `${start} ~ ${end}`
}

/** 是否存在任何可写进报告的事实（发布 / 回填 / 经营数字 / 归因行）。 */
export function hasWeeklyReviewData(input: WeeklyNarrativeInput): boolean {
  const { review } = input
  return review.publishedCount > 0
    || review.day7Backfill.due > 0
    || review.day7Backfill.filled > 0
    || review.qualifiedLeadCount > 0
    || review.appointmentCount > 0
    || review.dealCount > 0
    || review.revenue > 0
    || review.referencedAssetCount > 0
    || input.taskInsights.some((row) => row.publishedCount > 0)
}

/** 事实段：逐条引用结构化数据。这是数字的唯一出口，LLM 不得改写。 */
export function buildWeeklyFactsMarkdown(input: WeeklyNarrativeInput): string {
  const { review } = input
  const lines: string[] = []
  lines.push(`- 本周期：${periodLabel(review)}`)
  lines.push(`- 发布内容：${review.publishedCount} 条`)
  lines.push(`- 有效线索：${review.qualifiedLeadCount} 条`)
  lines.push(`- 预约：${review.appointmentCount} 个`)
  lines.push(`- 成交：${review.dealCount} 单`)
  lines.push(`- 收入：¥${review.revenue}`)
  lines.push(`- 资产复用：引用 ${review.referencedAssetCount} 项，其中被重复调用（≥2 次）${review.reusedAssetCount} 项`)
  if (review.day7Backfill.due === 0) {
    lines.push("- 第 7 天回填率：本周期尚未有到期窗口")
  } else {
    const rate = Math.round((review.day7Backfill.filled / review.day7Backfill.due) * 100)
    lines.push(`- 第 7 天回填率：${rate}%（${review.day7Backfill.filled}/${review.day7Backfill.due}）`)
  }
  if (input.taskInsights.length > 0) {
    lines.push("- 选题归因（按内容任务）：")
    for (const row of input.taskInsights) {
      const views = row.viewsTotal == null ? "未回填" : row.viewsTotal.toLocaleString("zh-CN")
      const note = row.sampleNote ? `（${row.sampleNote}）` : ""
      lines.push(
        `  - ${row.contentTask}：发布 ${row.publishedCount} 条｜播放合计 ${views}｜可追溯线索 ${row.traceableLeadCount} 条｜来源不明 ${row.unknownLeadCount} 条${note}`,
      )
    }
  } else {
    lines.push("- 选题归因：本周期无已发布内容，无归因聚合")
  }
  lines.push("")
  lines.push("> 口径说明：空值不代表 0；7/14/30 天为累计快照差值口径，不相加；线索按「挂到哪条内容」计。")
  return lines.join("\n")
}

function isSmallSample(input: WeeklyNarrativeInput): boolean {
  return input.review.publishedCount < 3
    || input.taskInsights.some((row) => row.sampleNote != null)
}

function buildTemplateSections(input: WeeklyNarrativeInput): string {
  const small = isSmallSample(input)
  const judgement = small
    ? "本周样本不足，只描述现象：以上事实段即本周全部可确认信息，不做趋势判断。"
    : "本周数据已具备初步样本，可就事实段中表现最好与最差的分项做相对比较，但仍不构成长期规律。"
  const uncertain = [
    "以下原因暂时不能确定，需要继续观察：",
    "- 各指标之间的因果关系（相关不等于因果）；",
    "- 数据缺口的影响：未回填的窗口与「来源不明」线索可能改变结论方向；",
    small ? "- 样本量不足，单周波动可能大于真实差异。" : "- 单周口径下的波动是否具有持续性。",
  ].join("\n")
  const suggestions = [
    "下一轮建议（供人审后执行）：",
    "- 优先补齐未回填窗口的数据，尤其是到期的第 7 天窗口；",
    "- 为「来源不明」线索补登记来源（加微/进线时挂来源内容）；",
    ...(small ? ["- 继续积累数据：样本不足，本周不下结论。"] : []),
    "- 保留本周表现较好的选题方向，下周同类再发一条验证。",
  ].join("\n")
  return [SECTION_HEADERS[0], judgement, "", SECTION_HEADERS[1], uncertain, "", SECTION_HEADERS[2], suggestions].join("\n")
}

export function buildNarrativePrompt(input: WeeklyNarrativeInput, factsMarkdown: string): string {
  return [
    "你是内容经营复盘助手。请基于下方【已确认的数据事实】写周度复盘报告的后三段。",
    "",
    "硬性纪律：",
    "1. 只能引用事实段中出现的数字，禁止编造、推算或修改任何数字；",
    "2. 相关不等于因果；样本不足时只描述现象，不下趋势或规律结论；",
    "3. 空值不代表 0；缺失的数据要在第三段说明其影响；",
    isSmallSample(input) ? "4. 本周样本不足，第四段建议必须包含一条「继续积累数据」；" : "4. 建议必须可执行（保留什么、调整什么、验证什么）；",
    "5. 语气克制，用中文，总长不超过 500 字。",
    "",
    "输出格式：只输出以下三段（含标题，标题逐字一致，不要输出第一段，不要输出其他内容）：",
    SECTION_HEADERS.join("\n"),
    "",
    "【已确认的数据事实】",
    factsMarkdown,
  ].join("\n")
}

function composeMarkdown(input: WeeklyNarrativeInput, factsMarkdown: string, sections: string, generatedAt: string): string {
  return [
    `# 周度经营复盘报告（${periodLabel(input.review)}）`,
    "",
    "## 一、已确认的数据事实",
    "",
    factsMarkdown,
    "",
    sections,
    "",
    "---",
    `自动初稿 · 生成于 ${generatedAt} · 数字真源：ContentOutcome / OutcomeAttribution · 对外使用前必须人工审核`,
  ].join("\n")
}

function validateLlmSections(content: string): boolean {
  return SECTION_HEADERS.every((header) => content.includes(header))
}

/**
 * 生成四段式周报。LLM 失败、被截断或格式不符时回退模板初稿，原因如实返回。
 * 数据为空时返回 empty（不出假报告）。
 */
export async function generateWeeklyNarrative(
  input: WeeklyNarrativeInput,
  options: { llm?: WeeklyNarrativeLlm; now?: () => Date } = {},
): Promise<WeeklyNarrative> {
  const generatedAt = (options.now ?? (() => new Date()))().toISOString()
  if (!hasWeeklyReviewData(input)) {
    return {
      source: "empty",
      generatedAt,
      markdown: [
        `# 周度经营复盘报告（${periodLabel(input.review)}）`,
        "",
        "## 本周期无已回填数据",
        "",
        "本周没有已发布内容或任何已回填的经营数据，不出复盘报告，不编造结论。",
        "下一步：先完成内容发布与第 7 天数据回填，再生成周报。",
      ].join("\n"),
    }
  }

  const factsMarkdown = buildWeeklyFactsMarkdown(input)
  const llm = options.llm ?? LLMClient.shared()
  try {
    const completion = await llm.complete({
      messages: [{ role: "user", content: buildNarrativePrompt(input, factsMarkdown) }],
      temperature: 0.2,
      maxTokens: 900,
    })
    if (completion.finishReason === "length") {
      throw new Error("LLM 输出被截断（finishReason=length）")
    }
    if (!validateLlmSections(completion.content)) {
      throw new Error("LLM 输出缺少必需段落标题")
    }
    return {
      source: "llm",
      generatedAt,
      markdown: composeMarkdown(input, factsMarkdown, completion.content.trim(), generatedAt),
    }
  } catch (error) {
    return {
      source: "template",
      generatedAt,
      fallbackReason: error instanceof Error ? error.message : "LLM 调用失败",
      markdown: composeMarkdown(input, factsMarkdown, buildTemplateSections(input), generatedAt),
    }
  }
}
