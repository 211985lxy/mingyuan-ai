// ─── IP 写作风格档案 · 渐进沉淀 ────────────────────────────
//
// 基于「第一性原理」的 5 维认知模型，从 AIM 对话里提炼用户的长期写作风格，
// 维护在一条用户级（projectId=null）的「主档案」上，upsert 合并，越沉淀越厚。
//
// 与 aim-chat-evolution.ts 的关系：那条提取「业务/客户偏好」(user_insight, 项目级)；
// 本模块提取「写作风格认知模型」(writing_style_profile, 用户级全局)。两者并存。

import { LLMClient } from "@/lib/llm/client"
import type { ChatMessage } from "@/lib/llm/types"
import { prisma } from "@/lib/prisma"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import {
  STYLE_PROFILE_CATEGORY,
  STYLE_PROFILE_MAIN_TITLE,
} from "@/lib/style-profile"

export type StyleProfileMessage = {
  role: "user" | "assistant"
  content: string
}

export interface StyleProfileDelta {
  cognitivePattern: { entry?: string; reasoning?: string; attitude?: string }
  emotionalTexture: { tone?: string; humor?: string }
  structuralDna: { hook?: string; twist?: string; ending?: string }
  microLinguistics: { sentence?: string; catchphrase?: string; metaphor?: string }
  coreValues: { beliefs?: string; supports?: string; opposes?: string }
  decisionHeuristics: { priorities?: string; tradeoffs?: string }
  antiPatterns: { avoids?: string; forbiddenTone?: string }
  honestLimits: { uncertainty?: string; requiresEvidence?: string }
  evidence: string
  confidence: "confirmed" | "user_claim" | "pending_verify"
}

/**
 * 风格档案的默认 tags。
 * 注意：asset_role 用合法值 judgment（见 lib/knowledge-tags.ts 的 ROLES 集合），
 * 不要重蹈 aim-chat-evolution.ts 里 asset_role:preference 的非法值 bug。
 */
export const STYLE_PROFILE_DEFAULT_TAGS = [
  "kb_scope:ip",
  "asset_role:judgment",
  "usable_for:video",
  "usable_for:wechat",
  "usable_for:xhs",
  "confidence:user_claim",
]

const EXTRACTION_MAX_TOKENS = 1800
const MERGE_MAX_TOKENS = 2200
const MERGE_MAX_CHARS = 1800

// ─── 提取 prompt ──────────────────────────────────────────

/**
 * @description 构建写作风格提取 Prompt（从对话中提炼 IP 的长期写作风格）
 * @param messages - 对话消息数组
 * @returns 用于 LLM 提取的 Prompt 文本
 */
export function buildStyleExtractionPrompt(messages: StyleProfileMessage[]): string {
  const recent = messages
    .slice(-12)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.content}`)
    .join("\n\n")
    .slice(0, 4000)

  return `你是 AIM 的「写作风格提取器」。只从【用户本人的发言】中提炼这位 IP 的长期写作风格，建立「第一性原理」认知模型——不模仿怎么写，而是提炼怎么想。

只提炼长期稳定的风格特征，不要提炼：
- 一次性改稿指令（如「把第二段删了」「换个词」）
- 助手自己的建议或示例
- 没有用户证据的猜测

按 8 个维度提炼，每个字段只填有用户证据的，没有证据就留空字符串：

{
  "cognitivePattern": {
    "entry": "切入问题的方式（归纳现象/演绎原理/类比迁移/反常识破题 等）",
    "reasoning": "主要论证逻辑链路",
    "attitude": "对读者的态度（平等对话/导师俯视/同伴分享 等）"
  },
  "emotionalTexture": {
    "tone": "情绪主色调（冷静理性/热血鼓动/克制温暖 等）",
    "humor": "幽默感来源（自嘲/反讽/冷幽默/无 等）"
  },
  "structuralDna": {
    "hook": "钩子设计偏好（反常识断言/具体数字/场景痛点提问 等）",
    "twist": "转折通常出现的位置（如 1/3 处/中点/2/3 处/无固定）",
    "ending": "结尾风格（回扣开头金句/行动号召/留白反问/情绪升华 等）"
  },
  "microLinguistics": {
    "sentence": "长短句偏好（短句连击/长短交替/长句铺陈 等）",
    "catchphrase": "口头禅或高频词",
    "metaphor": "比喻风格（具象生活化/跨界学科/无 等）"
  },
  "coreValues": {
    "beliefs": "反复强调的底层信念",
    "supports": "明确支持什么",
    "opposes": "明确反对什么"
  },
  "decisionHeuristics": {
    "priorities": "做判断时优先看什么、先后顺序是什么",
    "tradeoffs": "面对取舍时通常如何判断"
  },
  "antiPatterns": {
    "avoids": "明确不会采用的方法、套路或行为",
    "forbiddenTone": "明确不要的表达腔调、词汇或句式"
  },
  "honestLimits": {
    "uncertainty": "哪些问题会承认不知道、不确定或暂不判断",
    "requiresEvidence": "哪些结论必须有案例、数据或亲历证据才会说"
  },
  "evidence": "支撑以上判断的用户原话或近似原话（必填；若没有任何可沉淀的长期风格，整个对象返回 {}）",
  "confidence": "confirmed | user_claim | pending_verify"
}

如果这轮对话没有值得沉淀的长期写作风格，返回 {}。
只输出 JSON 对象，不要解释。

对话：
${recent}`
}

// ─── 解析 ─────────────────────────────────────────────────

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function hasAnyDimFilled(d: Partial<StyleProfileDelta>): boolean {
  const dims = [
    d.cognitivePattern,
    d.emotionalTexture,
    d.structuralDna,
    d.microLinguistics,
    d.coreValues,
    d.decisionHeuristics,
    d.antiPatterns,
    d.honestLimits,
  ]
  return dims.some((dim) => dim && Object.values(dim).some((v) => asString(v).length > 0))
}

/**
 * @description 解析 LLM 返回的风格档案 JSON，容错处理格式异常
 * @param raw - LLM 返回的原始 JSON 字符串
 * @returns 解析后的风格增量对象，无效时返回 null
 */
export function parseStyleProfileJson(raw: string): StyleProfileDelta | null {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    // 兜底：模型偶发把 JSON 包在文本里
    const s = raw.indexOf("{")
    const e = raw.lastIndexOf("}")
    if (s === -1 || e <= s) return null
    try {
      parsed = JSON.parse(raw.slice(s, e + 1))
    } catch {
      return null
    }
  }

  if (!parsed || typeof parsed !== "object") return null
  const obj = parsed as Record<string, unknown>
  // 空对象 → 无可沉淀内容
  if (Object.keys(obj).length === 0) return null

  const delta: StyleProfileDelta = {
    cognitivePattern: {
      entry: asString((obj.cognitivePattern as Record<string, unknown>)?.entry),
      reasoning: asString((obj.cognitivePattern as Record<string, unknown>)?.reasoning),
      attitude: asString((obj.cognitivePattern as Record<string, unknown>)?.attitude),
    },
    emotionalTexture: {
      tone: asString((obj.emotionalTexture as Record<string, unknown>)?.tone),
      humor: asString((obj.emotionalTexture as Record<string, unknown>)?.humor),
    },
    structuralDna: {
      hook: asString((obj.structuralDna as Record<string, unknown>)?.hook),
      twist: asString((obj.structuralDna as Record<string, unknown>)?.twist),
      ending: asString((obj.structuralDna as Record<string, unknown>)?.ending),
    },
    microLinguistics: {
      sentence: asString((obj.microLinguistics as Record<string, unknown>)?.sentence),
      catchphrase: asString((obj.microLinguistics as Record<string, unknown>)?.catchphrase),
      metaphor: asString((obj.microLinguistics as Record<string, unknown>)?.metaphor),
    },
    coreValues: {
      beliefs: asString((obj.coreValues as Record<string, unknown>)?.beliefs),
      supports: asString((obj.coreValues as Record<string, unknown>)?.supports),
      opposes: asString((obj.coreValues as Record<string, unknown>)?.opposes),
    },
    decisionHeuristics: {
      priorities: asString((obj.decisionHeuristics as Record<string, unknown>)?.priorities),
      tradeoffs: asString((obj.decisionHeuristics as Record<string, unknown>)?.tradeoffs),
    },
    antiPatterns: {
      avoids: asString((obj.antiPatterns as Record<string, unknown>)?.avoids),
      forbiddenTone: asString((obj.antiPatterns as Record<string, unknown>)?.forbiddenTone),
    },
    honestLimits: {
      uncertainty: asString((obj.honestLimits as Record<string, unknown>)?.uncertainty),
      requiresEvidence: asString((obj.honestLimits as Record<string, unknown>)?.requiresEvidence),
    },
    evidence: asString(obj.evidence),
    confidence: "user_claim",
  }

  const conf = asString(obj.confidence)
  if (conf === "confirmed" || conf === "pending_verify") {
    delta.confidence = conf
  }

  if (!hasAnyDimFilled(delta)) return null
  if (!delta.evidence) delta.evidence = "（本轮提炼，无直接原话）"

  return delta
}

// ─── 渲染 / 合并 ──────────────────────────────────────────

function dimLine(label: string, value?: string): string | null {
  const v = asString(value)
  return v ? `- ${label}：${v}` : null
}

function renderStyleProfileMarkdown(delta: StyleProfileDelta, stamp: string): string {
  const lines: string[] = ["# IP 写作风格档案", ""]

  lines.push("## 1. 思维的底层代码（Cognitive Pattern）")
  const cp = [
    dimLine("切入方式", delta.cognitivePattern.entry),
    dimLine("论证逻辑", delta.cognitivePattern.reasoning),
    dimLine("对读者态度", delta.cognitivePattern.attitude),
  ].filter(Boolean)
  lines.push(cp.length ? cp.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 2. 情绪的颗粒度（Emotional Texture）")
  const et = [
    dimLine("主色调", delta.emotionalTexture.tone),
    dimLine("幽默感来源", delta.emotionalTexture.humor),
  ].filter(Boolean)
  lines.push(et.length ? et.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 3. 结构的第一性（Structural DNA）")
  const sd = [
    dimLine("钩子设计", delta.structuralDna.hook),
    dimLine("转折位置", delta.structuralDna.twist),
    dimLine("结尾风格", delta.structuralDna.ending),
  ].filter(Boolean)
  lines.push(sd.length ? sd.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 4. 语言的微观特征（Micro-Linguistics）")
  const ml = [
    dimLine("长短句偏好", delta.microLinguistics.sentence),
    dimLine("口头禅/高频词", delta.microLinguistics.catchphrase),
    dimLine("比喻风格", delta.microLinguistics.metaphor),
  ].filter(Boolean)
  lines.push(ml.length ? ml.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 5. 核心价值观（Core Values）")
  const cv = [
    dimLine("反复强调的信念", delta.coreValues.beliefs),
    dimLine("明确支持", delta.coreValues.supports),
    dimLine("明确反对", delta.coreValues.opposes),
  ].filter(Boolean)
  lines.push(cv.length ? cv.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 6. 判断启发式（Decision Heuristics）")
  const dh = [
    dimLine("优先级", delta.decisionHeuristics.priorities),
    dimLine("取舍方式", delta.decisionHeuristics.tradeoffs),
  ].filter(Boolean)
  lines.push(dh.length ? dh.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 7. 明确禁区（Anti-patterns）")
  const ap = [
    dimLine("不采用", delta.antiPatterns.avoids),
    dimLine("不要的腔调", delta.antiPatterns.forbiddenTone),
  ].filter(Boolean)
  lines.push(ap.length ? ap.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("## 8. 诚实边界（Honest Limits）")
  const hl = [
    dimLine("承认不确定", delta.honestLimits.uncertainty),
    dimLine("证据要求", delta.honestLimits.requiresEvidence),
  ].filter(Boolean)
  lines.push(hl.length ? hl.join("\n") : "- （待沉淀）")
  lines.push("")

  lines.push("---")
  lines.push(`证据：${delta.evidence}`)
  lines.push(`置信度：${delta.confidence}`)
  lines.push(`版本来源：${stamp} 渐进沉淀`)

  return lines.join("\n")
}

function buildMergePrompt(existing: string, delta: StyleProfileDelta): string {
  const deltaJson = JSON.stringify(
    {
      ...delta,
      // 把 delta 也写成可读片段，降低模型理解成本
    },
    null,
    2,
  )

  return `你是 AIM 的「写作风格档案合并器」。把【新提炼的风格增量】合并进【现有主档案】，产出一份更新后的主档案。

规则：
- 保留现有档案里仍然成立的维度和证据，不要丢失已有沉淀。
- 新增量里的非空字段用于「强化 / 修正 / 补充」现有档案：方向一致就合并证据，方向冲突就以最新增量为准并替换。
- 每个维度只保留最凝练的描述，不要堆砌重复信息。
- 输出必须是 Markdown，严格沿用现有档案的 8 节结构（思维的底层代码 / 情绪的颗粒度 / 结构的第一性 / 语言的微观特征 / 核心价值观 / 判断启发式 / 明确禁区 / 诚实边界），末尾保留「证据 / 置信度 / 版本来源」三行。
- 总长度控制在 ${MERGE_MAX_CHARS} 字以内。没有内容的维度写「- （待沉淀）」。
- 不要输出任何解释，只输出更新后的 Markdown 档案本身。

【现有主档案】
${existing}

【新提炼的风格增量（JSON）】
${deltaJson}

请输出合并后的完整 Markdown 主档案。`
}

async function mergeStyleProfile(
  existingContent: string,
  delta: StyleProfileDelta,
  stamp: string,
): Promise<string> {
  const completion = await LLMClient.shared().complete({
    messages: [
      { role: "user", content: buildMergePrompt(existingContent, delta) } satisfies ChatMessage,
    ],
    maxTokens: MERGE_MAX_TOKENS,
    temperature: 0.2,
  })

  const merged = completion.content.trim()
  // 失败兜底：把 delta 渲染的新档案拼到旧档案后面（不丢数据）
  if (!merged || merged.length < 60) {
    return existingContent + "\n\n---\n" + renderStyleProfileMarkdown(delta, stamp)
  }
  return merged
}

// ─── 入口：提取 ───────────────────────────────────────────

/**
 * @description 将未知格式的消息数组标准化为 StyleProfileMessage 数组
 * @param value - 未知格式的消息数据
 * @returns 标准化后的消息数组
 */
export function normalizeStyleMessages(value: unknown): StyleProfileMessage[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      const role = (item as { role?: unknown }).role
      const content = (item as { content?: unknown }).content
      if ((role !== "user" && role !== "assistant") || typeof content !== "string") return null
      const trimmed = content.trim()
      if (!trimmed) return null
      return { role, content: trimmed }
    })
    .filter((item): item is StyleProfileMessage => item !== null)
}

/**
 * @description 从对话中提取写作风格增量（调用 LLM 进行风格分析）
 * @param input - 包含对话消息数组的对象
 * @returns 提取的风格增量，无可沉淀内容时返回 null
 */
export async function extractStyleProfileDelta(input: {
  messages: StyleProfileMessage[]
}): Promise<StyleProfileDelta | null> {
  const prompt = buildStyleExtractionPrompt(input.messages)
  const completion = await LLMClient.shared().complete({
    messages: [{ role: "user", content: prompt } satisfies ChatMessage],
    maxTokens: EXTRACTION_MAX_TOKENS,
    temperature: 0.2,
    responseFormat: { type: "json_object" },
  })
  return parseStyleProfileJson(completion.content)
}

// ─── 入口：upsert 主档案 ──────────────────────────────────

export interface UpsertStyleProfileResult {
  id: string
  title: string
  content: string
  created: boolean
}

/**
 * @description 创建或更新用户的主写作风格档案（合并新增量到现有档案）
 * @param input - 包含用户 ID、风格增量、日期戳和可选项目 ID 的对象
 * @returns 更新结果，包含档案 ID、标题、内容及是否为新建
 */
export async function upsertMainStyleProfile(input: {
  userId: string
  delta: StyleProfileDelta
  /** 日期戳（由调用方传入，避免在库内 new Date()） */
  stamp: string
  projectId?: string | null
}): Promise<UpsertStyleProfileResult> {
  const { userId, delta, stamp, projectId } = input
  const effectiveProjectId = projectId ?? null

  const existing = await prisma.knowledgeEntry.findFirst({
    where: {
      userId,
      category: STYLE_PROFILE_CATEGORY,
      title: STYLE_PROFILE_MAIN_TITLE,
      ...(effectiveProjectId ? { projectId: effectiveProjectId } : {}),
      status: "active",
    },
    select: { id: true, content: true },
  })

  if (existing) {
    const merged = await mergeStyleProfile(existing.content, delta, stamp)
    const updated = await prisma.knowledgeEntry.update({
      where: { id: existing.id },
      data: { content: merged, tags: STYLE_PROFILE_DEFAULT_TAGS },
      select: { id: true, title: true, content: true },
    })
    ensureKnowledgeEmbedding(updated.id).catch(() => {})
    return { ...updated, created: false }
  }

  const created = await prisma.knowledgeEntry.create({
    data: {
      userId,
      projectId: effectiveProjectId,
      category: STYLE_PROFILE_CATEGORY,
      title: STYLE_PROFILE_MAIN_TITLE,
      content: renderStyleProfileMarkdown(delta, stamp),
      tags: STYLE_PROFILE_DEFAULT_TAGS,
      sourceType: "manual",
    },
    select: { id: true, title: true, content: true },
  })
  ensureKnowledgeEmbedding(created.id).catch(() => {})
  return { ...created, created: true }
}
