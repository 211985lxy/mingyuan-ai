import {
  buildKnowledgeCitationMarkdown,
  upsertKnowledgeCitationInMethodNote,
} from "@/lib/aim-knowledge-cite"
import type { AimGenerateContext } from "./aim-agent-handlers"

export const CONTENT_CREATION_TRACE_RULE = `教学式透明交付规则：
- 每个完整成稿或文章的最前面，先输出 [[AIM_METHOD_NOTE]] ... [[/AIM_METHOD_NOTE]]；正文放在结束标记之后。
- 说明区只给可学习、可复用、可验证的高层结论，不输出逐字内部思维链。
- 说明区固定包含以下五部分：
  1. 「风格定位」：标注主风格与辅助风格（如幽默、专业、感性、犀利、沉稳），并说明与当前场景的关系。
  2. 「教学拆解」：用 3-5 条概括选题判断、开头钩子、结构推进、情绪基调和转化承接的取舍。
  3. 「来源标注」：分别列出“对标爆款视频来源”、“产品卖点”、“人设特点”，每项都写出来源名称与在本稿中的用法；名称必须来自当前知识块/选题上下文中的真实标题，不得编造。
  4. 「八字与紫微天命适配」：标注引用的八字/紫微资料来源，以及它如何影响文风、用词和情感基调。
  5. 「相关原文」：按知识块中真实命中的条目列出「相关原文见 《标题》（分类）」；没有命中时写“未提供/待补充”。服务端会用实际召回条目覆盖本小节，勿编造条目。
- 只能引用当前用户输入、选题上下文、知识库条目和 IP 定位维基中明确存在的来源名称；不得编造来源、视频、卖点、人设或命理结论。
- 任一类资料缺失时，必须在对应位置写“未提供/待补充”；没有八字或紫微资料时，不得把一般性格判断写成命理结论。
- 禁止把「相关原文见」写进口播/短视频正文；只放在 AIM_METHOD_NOTE 说明区。`

const METHOD_NOTE_PATTERN = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/

function asTraceRecord(item: unknown): Record<string, unknown> | null {
  return item && typeof item === "object" ? (item as Record<string, unknown>) : null
}

function traceEntryTitle(context: AimGenerateContext, pattern: RegExp, preferredCategory?: string): string | null {
  const entries = (context.retrievedEntries ?? [])
    .map(asTraceRecord)
    .filter((record): record is Record<string, unknown> => Boolean(record))
  const preferred = preferredCategory
    ? entries.find((record) => String(record.category ?? "") === preferredCategory && pattern.test([record.category, record.title, record.content].map(String).join("\n")))
    : undefined
  const entry = preferred ?? entries.find((record) => pattern.test([record.category, record.title, record.content].map(String).join("\n")))
  return entry && typeof entry.title === "string" && entry.title.trim() ? entry.title.trim() : null
}

function traceSource(value: string | null | undefined) {
  return value?.trim() || "未提供/待补充"
}

function resolveTraceProductSource(context: AimGenerateContext): string | null {
  return traceEntryTitle(context, /product_usp|product|offer|产品|卖点|服务|陪跑|阶梯/, "product_usp")
    || (/产品阶梯|产品卖点|陪跑|29800|核心交付/.test(context.ipWikiBlock ?? "") ? "IP 定位维基：成交路径与产品阶梯" : null)
}

function patchPlaceholderTraceSources(note: string, context: AimGenerateContext): string {
  let patched = note
  const productSource = resolveTraceProductSource(context)
  if (productSource) {
    patched = patched.replace(/产品卖点：\s*未提供\/待补充/g, `产品卖点：${productSource}`)
  }
  const personaSource = traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/, "positioning_material")
    || traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/)
  if (personaSource) {
    patched = patched.replace(/人设特点：\s*未提供\/待补充/g, `人设特点：${personaSource}`)
  }
  return patched
}

function attachDeterministicCitationNote(noteWithMarkers: string, context: AimGenerateContext): string {
  const citationBlock = buildKnowledgeCitationMarkdown(context.retrievedEntries ?? [])
  const match = noteWithMarkers.match(/^\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]$/)
  if (!match) return noteWithMarkers
  const inner = upsertKnowledgeCitationInMethodNote(
    match[1],
    citationBlock || "### 相关原文\n- 未提供/待补充",
  )
  return `[[AIM_METHOD_NOTE]]\n${inner}\n[[/AIM_METHOD_NOTE]]`
}

function buildFallbackContentCreationTrace(context: AimGenerateContext): string {
  const productSource = resolveTraceProductSource(context)
  const personaSource = traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/, "positioning_material")
    || traceEntryTitle(context, /persona|positioning|style|人设|定位|风格|故事/)
  const baziSource = traceEntryTitle(context, /bazi|八字|四柱|五行/)
    || (/八字|四柱|五行/.test(context.ipWikiBlock) ? "IP 定位维基" : null)
  const ziweiSource = traceEntryTitle(context, /ziwei|紫微|命宫|天命/)
    || (/紫微|命宫|天命/.test(context.ipWikiBlock) ? "IP 定位维基" : null)
  const benchmarkSource = context.topicTitle
    ? `选题上下文：${context.topicTitle}`
    : /对标|爆款|原视频/.test(context.rawInput)
      ? "用户输入中的对标/爆款素材（未识别到独立标题或链接）"
      : null
  const task = context.taskSpec
  const logicSteps = [
    task?.targetCustomer ? `目标客户：${task.targetCustomer}` : "目标客户：按当前输入与 IP 定位校准。",
    task?.contentTask ? `内容任务：${task.contentTask}` : task?.goal ? `内容目标：${task.goal}` : "内容任务：围绕用户本轮明确需求交付。",
    `结构取舍：按 ${(context.targetFormats ?? []).join("、") || "当前格式"} 的成品要求组织钩子、正文和承接。`,
  ]
  const stylePositioning = context.ipWikiBlock || personaSource
    ? "以 IP 定位与人设资料为主，保持专业、清晰与人格一致。"
    : "专业、清晰、可信；完整人设风格待补充。"
  const hasDestiny = Boolean(baziSource || ziweiSource)
  const citationBlock = buildKnowledgeCitationMarkdown(context.retrievedEntries ?? [])
    || "### 相关原文\n- 未提供/待补充"

  return attachDeterministicCitationNote(`[[AIM_METHOD_NOTE]]
### 风格定位
- ${stylePositioning}

### 教学拆解
${logicSteps.map((step) => `- ${step}`).join("\n")}

### 来源标注
- 对标爆款视频来源：${traceSource(benchmarkSource)}
- 产品卖点：${traceSource(productSource)}
- 人设特点：${traceSource(personaSource)}

### 八字与紫微天命适配
- 八字依据：${traceSource(baziSource)}
- 紫微依据：${traceSource(ziweiSource)}
- 风格映射：${hasDestiny ? "现有命理资料已作为文风、用词和情感基调的校准依据。" : "未做命理推断；待补充八字或紫微资料后再校准。"}

${citationBlock}
[[/AIM_METHOD_NOTE]]`, context)
}

/**
 * @description 确保内容包含创作溯源信息
 */
export function ensureContentCreationTrace(content: string, context: AimGenerateContext): string {
  const trimmed = content.trim()
  if (context.runtimeTask === "light_edit") return trimmed
  const existing = trimmed.match(METHOD_NOTE_PATTERN)
  const note = existing?.[0] || ""
  const complete = ["风格定位", "教学拆解", "对标爆款视频来源", "产品卖点", "人设特点", "八字", "紫微"]
    .every((label) => note.includes(label))
  if (complete) {
    const patchedNote = attachDeterministicCitationNote(patchPlaceholderTraceSources(note, context), context)
    return patchedNote === note ? trimmed : trimmed.replace(note, patchedNote)
  }
  const result = existing ? trimmed.replace(existing[0], "").trim() : trimmed
  return `${buildFallbackContentCreationTrace(context)}\n\n${result}`
}
