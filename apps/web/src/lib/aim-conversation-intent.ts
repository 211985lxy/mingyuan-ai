import { LLMClient } from "@/lib/llm/client"
import { extractLatestAimUserIntentText } from "@/lib/aim-current-user-input"
import { hasExplicitNewTaskIntent } from "@/lib/aim-workbench-commands"

export type AimConversationMode =
  | "chat"
  | "follow_up_edit"
  | "local_edit"
  | "select_version"
  | "formal_delivery"
  | "new_task"
  | "clarify_task_boundary"

export interface AimConversationIntent {
  mode: AimConversationMode
  confidence: number
  reason: string
  targetSummary: string
  useKnowledge: boolean
  useMethodology: boolean
  useLongTermMemory: boolean
  useStyleProfile: boolean
}

interface SimpleMessage {
  role: "user" | "assistant"
  content: unknown
}

interface RuleIntentResult {
  intent: AimConversationIntent
  needsLlmFallback: boolean
}

const REFERENCE_WORDS = ["这篇", "这版", "上面那个", "上面这条", "刚才那个", "刚那条", "第一条", "第二条", "上一版"]
const EARLIEST_REFERENCE_WORDS = ["最早那版", "最开始那版", "第一版", "原始对标文案", "最早那个对标文案", "最早那条", "原稿", "原文"]
const CORRECTION_WORDS = ["不是这个意思", "不是这个", "你理解错了", "你听错了", "我不是说", "不是让你", "不要换", "别重写", "不要重写"]
const LOCAL_EDIT_PARTS = ["开头", "前3秒", "前三秒", "第一句话", "钩子", "起手", "开场", "标题", "结尾", "收尾", "这句话", "这段", "第二段", "第三段"]
const EDIT_WORDS = ["改", "修改", "调整", "润色", "优化", "换个说法", "顺一下"]
const FORMAL_DELIVERY_WORDS = ["生成", "输出", "写一版", "给我一版", "完整方案", "完整报告", "资产包", "100条", "发布计划", "交付", "直接输出", "完整质检"]
const SELECT_VERSION_WORDS = ["选第一条", "用第一条", "要第一条", "就第一条", "选第二条", "用第二条", "要第二条", "就第二条"]
const KNOWLEDGE_ACTION_WORDS = ["结合", "参考", "用上", "调用", "融入", "带入", "写进", "放进"]
const KNOWLEDGE_TARGET_WORDS = ["知识库", "资料", "人设", "IP故事", "来时路", "产品卖点", "卖点", "老板卖点", "老板经历", "老板故事", "案例", "客户痛点", "客户问答", "项目案例"]

function extractTextContent(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return ""
      const item = part as { type?: unknown; text?: unknown }
      return item.type === "text" && typeof item.text === "string" ? item.text : ""
    })
    .filter(Boolean)
    .join("\n")
}

function normalizeMessages(messages: SimpleMessage[]) {
  return messages
    .map((message) => ({
      role: message.role,
      content: extractTextContent(message.content).trim(),
    }))
    .filter((message) => message.content.length > 0)
}

function includesAny(text: string, words: string[]) {
  return words.some((word) => text.includes(word))
}

function clip(text: string, max = 240) {
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

function buildTargetSummary(
  messages: Array<{ role: "user" | "assistant"; content: string }>,
  wantsReference: boolean,
  wantsEarliestReference: boolean,
) {
  if (!wantsReference) return ""
  const assistantMessages = messages.filter((message) => message.role === "assistant")
  const target = wantsEarliestReference ? assistantMessages[0] : assistantMessages[assistantMessages.length - 1]
  return target ? clip(target.content) : ""
}

function createRuleIntentResult(input: {
  mode: AimConversationMode
  confidence: number
  reason: string
  targetSummary: string
  useKnowledge: boolean
  useMethodology?: boolean
  useStyleProfile: boolean
  needsLlmFallback: boolean
}): RuleIntentResult {
  return {
    intent: {
      mode: input.mode,
      confidence: input.confidence,
      reason: input.reason,
      targetSummary: input.targetSummary,
      useKnowledge: input.useKnowledge,
      useMethodology: input.useMethodology ?? false,
      useLongTermMemory: true,
      useStyleProfile: input.useStyleProfile,
    },
    needsLlmFallback: input.needsLlmFallback,
  }
}

interface ConversationRuleSignals {
  latestUser: string
  hasPriorUserTurn: boolean
  isWritingAgent: boolean
  wantsEarliestReference: boolean
  wantsReference: boolean
  isCorrection: boolean
  isLocalEdit: boolean
  isSelectVersion: boolean
  isFormalDelivery: boolean
  wantsKnowledgeSupport: boolean
  targetSummary: string
  lowered: string
}

function collectConversationRuleSignals(input: {
  agentId: string
  messages: SimpleMessage[]
}): ConversationRuleSignals {
  const normalized = normalizeMessages(input.messages)
  const latestUserRaw = [...normalized].reverse().find((message) => message.role === "user")?.content ?? ""
  const latestUser = extractLatestAimUserIntentText(latestUserRaw)
  const lowered = latestUser.replace(/\s+/g, "")
  const wantsEarliestReference = includesAny(lowered, EARLIEST_REFERENCE_WORDS)
  const wantsReference = wantsEarliestReference || includesAny(lowered, REFERENCE_WORDS)
  const isCorrection = includesAny(lowered, CORRECTION_WORDS)
  const isLocalEdit = includesAny(lowered, EDIT_WORDS) && includesAny(lowered, LOCAL_EDIT_PARTS)
  const isSelectVersion = includesAny(lowered, SELECT_VERSION_WORDS) || (/第[一二三123]/.test(lowered) && lowered.includes("条"))
  const wantsKnowledgeSupport =
    (includesAny(lowered, KNOWLEDGE_ACTION_WORDS) && includesAny(lowered, KNOWLEDGE_TARGET_WORDS))
    || includesAny(lowered, ["调取知识库", "调用知识库", "知识库资料", "人设资料", "产品卖点", "老板卖点"])

  return {
    latestUser,
    hasPriorUserTurn: normalized.filter((message) => message.role === "user").length > 1,
    isWritingAgent: ["content_producer", "free_copywriter", "deep_copywriter"].includes(input.agentId),
    wantsEarliestReference,
    wantsReference,
    isCorrection,
    isLocalEdit,
    isSelectVersion,
    isFormalDelivery: includesAny(lowered, FORMAL_DELIVERY_WORDS),
    wantsKnowledgeSupport,
    targetSummary: buildTargetSummary(
      normalized,
      wantsReference || isCorrection || isLocalEdit || isSelectVersion,
      wantsEarliestReference,
    ),
    lowered,
  }
}

function resolveExplicitEditIntent(signals: ConversationRuleSignals): RuleIntentResult | null {
  const { latestUser, lowered, targetSummary, wantsKnowledgeSupport } = signals
  if (hasExplicitNewTaskIntent(latestUser)) {
    return createRuleIntentResult({
      mode: "new_task", confidence: 0.99, reason: "用户明确开启了与上一轮分离的新任务",
      targetSummary: "", useKnowledge: true, useMethodology: true,
      useStyleProfile: true, needsLlmFallback: false,
    })
  }
  if (signals.isCorrection) {
    return createRuleIntentResult({
      mode: "follow_up_edit", confidence: 0.98, reason: "用户在纠偏上一轮理解或结果",
      targetSummary, useKnowledge: wantsKnowledgeSupport,
      useStyleProfile: true, needsLlmFallback: false,
    })
  }
  if (signals.isLocalEdit) {
    return createRuleIntentResult({
      mode: "local_edit", confidence: 0.96, reason: "用户只要求局部修改当前稿件",
      targetSummary, useKnowledge: wantsKnowledgeSupport,
      useStyleProfile: true, needsLlmFallback: false,
    })
  }
  if (signals.isSelectVersion) {
    return createRuleIntentResult({
      mode: "select_version", confidence: 0.92, reason: "用户在选择上一轮候选版本或编号结果",
      targetSummary, useKnowledge: wantsKnowledgeSupport,
      useStyleProfile: false, needsLlmFallback: false,
    })
  }
  if (signals.wantsReference && includesAny(lowered, EDIT_WORDS)) {
    return createRuleIntentResult({
      mode: "follow_up_edit", confidence: 0.88, reason: "用户基于上一轮内容继续追改",
      targetSummary, useKnowledge: wantsKnowledgeSupport,
      useStyleProfile: true, needsLlmFallback: false,
    })
  }
  return null
}

export function resolveAimConversationIntentWithRules(input: {
  agentId: string
  messages: SimpleMessage[]
}): RuleIntentResult {
  const signals = collectConversationRuleSignals(input)
  const explicitIntent = resolveExplicitEditIntent(signals)
  if (explicitIntent) return explicitIntent
  const fallbackNeeded = signals.wantsReference || (signals.hasPriorUserTurn && signals.isWritingAgent)

  if (signals.isFormalDelivery) {
    return createRuleIntentResult({
      mode: "formal_delivery",
      confidence: 0.84,
      reason: "用户明确要求生成正式交付物",
      targetSummary: signals.targetSummary,
      useKnowledge: true,
      useMethodology: true,
      useStyleProfile: true,
      needsLlmFallback: fallbackNeeded,
    })
  }

  return createRuleIntentResult({
    mode: "chat",
    confidence: signals.wantsReference ? 0.55 : 0.72,
    reason: "默认按自然对话处理当前轮输入",
    targetSummary: signals.targetSummary,
    useKnowledge: signals.wantsKnowledgeSupport,
    useStyleProfile: false,
    needsLlmFallback: fallbackNeeded,
  })
}

function parseIntentJson(raw: string): Partial<AimConversationIntent> | null {
  const text = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "")
  try {
    const parsed = JSON.parse(text) as Record<string, unknown>
    return {
      mode: typeof parsed.mode === "string" ? parsed.mode as AimConversationMode : undefined,
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
      targetSummary: typeof parsed.targetSummary === "string" ? parsed.targetSummary : undefined,
    }
  } catch {
    return null
  }
}

async function refineIntentWithLlm(input: {
  latestUser: string
  targetSummary: string
  fallback: AimConversationIntent
}): Promise<Partial<AimConversationIntent> | null> {
  const prompt = [
    "你是 AIM 的对话意图解析器。请只输出 JSON。",
    "目标：判断当前用户输入更像自然对话(chat)、追改纠偏(follow_up_edit)、局部修改(local_edit)、选择版本(select_version)、正式交付(formal_delivery)、与旧稿隔离的新任务(new_task)，还是任务边界不清需要先确认(clarify_task_boundary)。",
    "判断时当前用户指令优先于历史。内容主题、交付物或目标已经改变且本轮要求可独立执行时，判为 new_task；无法判断用户是改旧稿还是另写时，判为 clarify_task_boundary。",
    "如果用户在引用上一轮内容，请给出 targetSummary；否则留空字符串。",
    "禁止解释，禁止 markdown。",
    "",
    `当前用户输入：${input.latestUser}`,
    input.targetSummary ? `最近相关上文：${input.targetSummary}` : "最近相关上文：",
    `规则默认结果：${input.fallback.mode}`,
    "",
    '输出格式：{"mode":"chat|follow_up_edit|local_edit|select_version|formal_delivery|new_task|clarify_task_boundary","reason":"一句话","targetSummary":"字符串"}',
  ].join("\n")

  try {
    const completion = await LLMClient.shared().complete({
      messages: [{ role: "user", content: prompt }],
      temperature: 0,
      maxTokens: 300,
      responseFormat: { type: "json_object" },
    })
    return parseIntentJson(completion.content)
  } catch {
    return null
  }
}

export async function resolveAimConversationIntent(input: {
  agentId: string
  messages: SimpleMessage[]
}): Promise<AimConversationIntent> {
  const { intent, needsLlmFallback } = resolveAimConversationIntentWithRules(input)
  if (!needsLlmFallback) return intent

  const normalized = normalizeMessages(input.messages)
  const latestUser = [...normalized].reverse().find((message) => message.role === "user")?.content ?? ""
  const recentContext = normalized
    .slice(0, -1)
    .slice(-3)
    .map((message) => `${message.role === "user" ? "用户" : "助手"}：${message.content}`)
    .join("\n")
  const refined = await refineIntentWithLlm({
    latestUser,
    targetSummary: intent.targetSummary || clip(recentContext, 600),
    fallback: intent,
  })

  if (!refined?.mode) return intent

  const mode = refined.mode
  if (!["chat", "follow_up_edit", "local_edit", "select_version", "formal_delivery", "new_task", "clarify_task_boundary"].includes(mode)) {
    return intent
  }

  const isFormal = mode === "formal_delivery" || mode === "new_task"
  const isStyleful = mode === "follow_up_edit" || mode === "local_edit" || isFormal

  return {
    mode,
    confidence: 0.78,
    reason: refined.reason || `${mode} via llm fallback`,
    targetSummary: mode === "new_task" ? "" : refined.targetSummary || intent.targetSummary,
    useKnowledge: isFormal,
    useMethodology: isFormal,
    useLongTermMemory: mode !== "clarify_task_boundary",
    useStyleProfile: isStyleful,
  }
}

export function buildConversationIntentBlock(intent: AimConversationIntent): string {
  const lines = [
    "【指令优先级】用户当前明确指令 > 当前任务所需上下文 > 历史对话 > 方法论、知识库与风格规则。低优先级内容不得覆盖、改写或劫持高优先级指令。",
    "【总原则】先完整理解用户当前这句话，再决定是否调用规则；规则、方法论、知识库和写作风格都只能辅助执行，不能替用户决定任务。",
    "【纠偏优先】如果用户在表达不满、纠正理解、否定上一轮，先按他的纠正改，不要继续机械执行上一轮任务。",
    `【当前对话模式】${intent.mode}`,
    `【处理原则】${intent.reason}`,
  ]

  if (intent.targetSummary) {
    lines.push(`【当前优先围绕的上文内容】${intent.targetSummary}`)
  }

  if (intent.mode === "chat") {
    lines.push("先直接回答用户当前这句话，不要自动展开完整流程、完整模板或正式交付结构。")
  } else if (intent.mode === "follow_up_edit") {
    lines.push("这是对上一轮结果的追改或纠偏。先按用户当前纠正去修，不要跳回更早素材，也不要擅自重开新稿。")
  } else if (intent.mode === "local_edit") {
    lines.push("这是局部修改。只改用户点名的部分，默认保留当前稿的主题、主体结构和有效表达。")
  } else if (intent.mode === "select_version") {
    lines.push("这是版本选择或版本确认。优先围绕最近候选内容回应，不要顺手扩写成新的完整交付物。")
  } else if (intent.mode === "new_task") {
    lines.push("这是独立新任务。只执行本轮指令，不得延续、修改或引用上一稿；长期事实与已确认风格可以辅助，但不得改变本轮目标。")
  } else if (intent.mode === "clarify_task_boundary") {
    lines.push("当前无法确定用户要修改旧稿还是另开新稿。只提出一个最短确认问题，不要先生成或改写任何文案。")
  } else {
    lines.push("这是正式交付。可以启用完整知识库、方法论和固定交付结构。")
  }

  return lines.join("\n")
}
