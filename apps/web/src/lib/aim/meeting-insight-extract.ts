/**
 * 客户会议原文 → 结构化 JSON 抽取层（WP-6B）。
 *
 * 把“已经人工整理好的九类字段”升级为：会议原文 → 现有 AIM 模型层抽取结构化 JSON。
 *
 * 设计决策（对齐简报）：
 * - 不新建第二套 Agent 运行时，不新接模型 SDK：直接复用仓库 LLMClient（@/lib/llm）。
 * - 模型名不硬编码：MEETING_INSIGHT_MODEL 取自 env，未配置则为 undefined，
 *   交由 provider 的 defaultModel + 降级链（对齐 script-generation/models.ts 与 agent-router）。
 * - LLM 输出必过 parseInsightJson 严格解析，禁止把未验证结果写出（对接域层 extractMeetingInsight）。
 * - 缺失/缠绕信息保留为空或 unresolved，不补造预算/负责人/决策阶段/客户承诺。
 * - 不返回硬编码演示结果；transcript 为空在调用模型前拒绝。
 *
 * 与 knowledge-entity-extractor.ts 同构：纯函数 prompt + 纯函数解析 + 可注入 complete 端口。
 */
import { env } from "@/env"
import type { CompletionResult } from "@/lib/llm"
import { getAgentLLM } from "@/lib/llm/agent-router"
import type { MeetingInsightInput } from "@/lib/aim/meeting-insight"
import type { AimModelPolicy } from "@/lib/aim-harness/types"
import { getRegisteredLoop } from "@/lib/aim/loops/registry"
import { isMeetingEvidenceKind, type MeetingEvidence } from "@/lib/aim/sales-diagnosis/evidence"

/** 模型名（可选，未配置走 provider 默认 + 降级链）。不硬编码。 */
export const MEETING_INSIGHT_MODEL: string | undefined = env.MEETING_INSIGHT_MODEL?.trim() || undefined

/** 会议原文抽取输入。 */
export interface MeetingInsightExtractionInput {
  meetingTitle: string
  customer: string
  /** 会议原文/逐字稿/纪要。为空时在调用模型前拒绝。 */
  transcript: string
  projectId?: string
  workItemRecordId?: string
}

/** 抽取结果：成功带 MeetingInsightInput（交域层规整），失败带可行动错误。 */
export type MeetingInsightExtractionResult =
  | { ok: true; input: MeetingInsightInput }
  | { ok: false; error: string }

/** LLM complete 端口形态（便于注入测试替身；生产用 LLMClient.shared()）。 */
export type CompleteFn = (options: {
  model?: string
  messages: Array<{ role: "system" | "user"; content: string }>
  temperature: number
  maxTokens: number
  responseFormat: { type: "json_object" }
}) => Promise<CompletionResult>

const SYSTEM_PROMPT = [
  "你是客户会后洞察抽取器。从会议原文中抽取结构化洞察，供销售/咨询团队跟进。",
  "只输出**纯 JSON**（不要 markdown 代码块、不要解释、不要前后缀），结构如下：",
  "{",
  '  "pains": ["客户痛点/诉求"],',
  '  "goals": ["客户目标/想达成的结果"],',
  '  "budgets": ["预算表述，如：种子轮1500万、第三方服务费约20万；没有就留空数组"],',
  '  "decisionStage": "决策阶段，必须是以下之一：初步接触 / 需求确认 / 方案比较 / 决策中 / 已成交 / 暂搁置；无法判断留空串",',
  '  "objections": ["异议/顾虑/卡点"],',
  '  "followUps": ["下一步跟进建议"],',
  '  "diagnosisQuestions": ["需进一步澄清的诊断问题"],',
  '  "topicCandidates": ["可转成短视频的真实选题（基于客户原话）"],',
  '  "deliveryTasks": [{"title": "交付任务", "owner": "负责人（未指明则省略 owner）"}],',
  '  "evidence": [{"kind": "pain | goal | budget | objection | commitment | task", "statement": "对应判断", "quote": "从会议原文逐字复制的短句"}]',
  "}",
  "铁律：",
  "- 宁缺毋滥：原文没有的信息不要编造，对应字段留空数组或空串。",
  "- 不要补造预算金额、负责人、决策阶段或客户承诺。",
  "- evidence.quote 必须逐字复制会议原文，不得改写；没有可引用原文的判断不要输出。",
  "- 跟进建议不是客户承诺。只有客户明确表示会采取某动作时，才可输出 commitment 证据。",
  "- commitment 的 statement 必须逐字摘自 quote 中对应的承诺内容，不得概括或改写。",
  "- 全部字段为中文。pains/goals/objections/followUps/diagnosisQuestions/topicCandidates 为字符串数组；deliveryTasks 和 evidence 为对象数组。",
].join("\n")

/**
 * 构造抽取 prompt（纯函数）。transcript 截断以防超长输入。
 */
export function buildExtractionPrompt(transcript: string): { system: string; user: string } {
  return {
    system: SYSTEM_PROMPT,
    user: `会议标题：${""}\n客户：${""}\n\n请抽取以下会议原文的结构化洞察：\n\n${transcript.slice(0, 12000)}`,
  }
}

// ── 严格 JSON 解析（纯函数，对畸形输入容错） ────────────────────────────

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const out: string[] = []
  for (const item of value) {
    if (typeof item === "string") {
      const v = item.trim()
      if (v) out.push(v)
    }
  }
  return out
}

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

function asDeliveryTasks(value: unknown): MeetingInsightInput["deliveryTasks"] {
  if (!Array.isArray(value)) return []
  const out: MeetingInsightInput["deliveryTasks"] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const title = asString(obj.title)
    if (!title) continue // 没标题的任务丢弃，不伪造
    const owner = asString(obj.owner)
    out.push(owner ? { title, owner } : { title })
  }
  return out
}

function asEvidence(value: unknown): MeetingEvidence[] {
  if (!Array.isArray(value)) return []
  const out: MeetingEvidence[] = []
  for (const item of value) {
    if (!item || typeof item !== "object") continue
    const obj = item as Record<string, unknown>
    const kind = asString(obj.kind)
    const statement = asString(obj.statement)
    const quote = asString(obj.quote)
    if (!isMeetingEvidenceKind(kind) || !statement || !quote) continue
    out.push({ kind, statement, quote })
  }
  return out
}

/**
 * 把 LLM 原始输出解析为 MeetingInsightInput。
 * - 剥离代码围栏、抢救首个 JSON 块。
 * - 字段类型错误归一化（不抛错，宁缺毋滥）。
 * - 完全无法解析 → ok:false。
 * 返回的 MeetingInsightInput 仍需交 extractMeetingInsight 做枚举收敛/去重/校验。
 */
export function parseInsightJson(raw: string): MeetingInsightExtractionResult {
  if (!raw || typeof raw !== "string" || !raw.trim()) {
    return { ok: false, error: "模型输出为空，无法解析为会议洞察 JSON。" }
  }

  let text = raw.trim()
  // 剥离 markdown 代码围栏（```json ... ``` 或 ``` ... ```）。
  text = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    // 抢救首个 JSON 对象/数组。
    const match = text.match(/(\{[\s\S]*\}|\[[\s\S]*\])/)
    if (!match) {
      return { ok: false, error: "模型输出不是合法 JSON，且无法抢救出 JSON 块。" }
    }
    try {
      parsed = JSON.parse(match[0])
    } catch {
      return { ok: false, error: "模型输出 JSON 块解析失败。" }
    }
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "模型输出 JSON 顶层不是对象。" }
  }

  const obj = parsed as Record<string, unknown>
  const input: MeetingInsightInput = {
    meetingTitle: "",
    customer: "",
    pains: asStringArray(obj.pains),
    goals: asStringArray(obj.goals),
    budgets: asStringArray(obj.budgets),
    decisionStage: asString(obj.decisionStage),
    objections: asStringArray(obj.objections),
    followUps: asStringArray(obj.followUps),
    diagnosisQuestions: asStringArray(obj.diagnosisQuestions),
    topicCandidates: asStringArray(obj.topicCandidates),
    deliveryTasks: asDeliveryTasks(obj.deliveryTasks),
    evidence: asEvidence(obj.evidence),
  }
  return { ok: true, input }
}

// ── 抽取入口（调 LLM） ────────────────────────────────────────────────

/**
 * 从会议原文抽取结构化洞察。
 * - transcript 为空/过短 → 在调用模型前拒绝（ok:false）。
 * - complete 端口默认用 LLMClient.shared()；测试可注入替身。
 * - 失败（模型异常/坏 JSON）一律 ok:false，禁止把未验证结果写出。
 */
export async function extractMeetingInsightFromTranscript(
  extraction: MeetingInsightExtractionInput,
  ports?: { modelPolicy?: AimModelPolicy; complete?: CompleteFn },
): Promise<MeetingInsightExtractionResult> {
  const transcript = extraction.transcript?.trim() ?? ""
  if (!transcript || transcript.length < 8) {
    return { ok: false, error: "会议原文（transcript）为空或过短，拒绝调用模型抽取。" }
  }

  const loop = getRegisteredLoop("sales-diagnosis-v1")
  const modelPolicy = ports?.modelPolicy ?? {
    agentId: "business_diagnosis",
    stream: false,
    temperature: loop.modelPolicy.temperature,
    maxTokens: loop.supervisionPolicy.budget.maxOutputTokens,
    targetCapability: "advanced",
    minimumCapability: "standard",
    maxProviderAttempts: loop.supervisionPolicy.budget.maxProviderAttempts,
  }
  const complete: CompleteFn = ports?.complete ?? defaultComplete(modelPolicy)
  const prompt = buildExtractionPrompt(transcript)

  let result: CompletionResult
  try {
    result = await complete({
      ...(MEETING_INSIGHT_MODEL ? { model: MEETING_INSIGHT_MODEL } : {}),
      messages: [
        { role: "system", content: prompt.system },
        { role: "user", content: prompt.user },
      ],
      temperature: modelPolicy.temperature ?? 0,
      maxTokens: modelPolicy.maxTokens ?? 256,
      responseFormat: { type: "json_object" },
    })
  } catch (err) {
    return { ok: false, error: `会议洞察模型调用失败：${err instanceof Error ? err.message : String(err)}` }
  }

  const parsed = parseInsightJson(result.content)
  if (!parsed.ok) {
    // 把模型原始片段附在错误里，便于人工定位（不写客户原文进生产日志的敏感字段由调用方控制）。
    return {
      ok: false,
      error: `${parsed.error}（模型输出前 200 字：${result.content.slice(0, 200)}）`,
    }
  }
  // 补回会议级元信息（meetingTitle/customer 来自输入，不由模型产出，避免漂移）。
  parsed.input.meetingTitle = extraction.meetingTitle?.trim() ?? ""
  parsed.input.customer = extraction.customer?.trim() ?? ""
  return { ok: true, input: parsed.input }
}

function defaultComplete(modelPolicy: AimModelPolicy): CompleteFn {
  const llm = getAgentLLM("business_diagnosis", {
    minimumCapability: modelPolicy.minimumCapability,
    maxProviderAttempts: modelPolicy.maxProviderAttempts,
  })
  return (options) => llm.complete(options)
}
