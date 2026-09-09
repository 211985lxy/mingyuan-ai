import type { AimContentSourceEnvelope } from "@/lib/aim/content-source-envelope"
import { executeGenerateLLM } from "@/lib/aim-agent-model"
import { runAimTraceStep, summarizeText, type AimTraceRecorder } from "@/lib/aim-observability"
import type { AimModelPolicy } from "@/lib/aim-harness/types"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"

export interface AimSemanticTaskUnderstanding {
  brief: string
  handling: "respond" | "deliver" | "clarify"
  /** 兼容字段：首个追问（完整文本见 clarificationQuestions） */
  clarificationQuestion?: string
  /** 一次最多 3 个编号追问（用户指令唯一真源：关键缺口一次问完，不用隐藏默认值顶替） */
  clarificationQuestions?: string[]
}

type CompletePort = (systemPrompt: string, userPrompt: string) => Promise<{ content: string }>

const FORBIDDEN_ACTION_LABEL = /\b(?:create|local_edit|rewrite|batch|scope|mustKeep)\b/i
const SEMANTIC_PROTOCOL_ERROR_PATTERN = /^(?:语义理解|澄清协议|非澄清响应)/
const FULL_CONTENT_CREATION_PATTERN = /(?:写|生成|创作|仿写|改写|重写|做|出).{0,12}(?:文案|口播|文章|脚本|内容|一篇|一版|一个)/
const CONTENT_ANALYSIS_QUESTION_PATTERN = /(?:是什么|什么结构|什么类型|为何|为什么|怎么改|如何优化|哪种|哪个|是否).*[？?]?$/

function fallbackExplicitContentCreation(envelope: AimContentSourceEnvelope): AimSemanticTaskUnderstanding | null {
  const request = envelope.currentUserRequest.trim().replace(/\s+/g, "")
  if (!request || CONTENT_ANALYSIS_QUESTION_PATTERN.test(request)) return null
  if (!FULL_CONTENT_CREATION_PATTERN.test(request)) return null
  return { handling: "deliver", brief: envelope.currentUserRequest.trim() }
}

/** 同步判定常见交付/问答，跳过额外 LLM「语义理解」以降低首字延迟。 */
export function resolveSemanticUnderstandingFastPath(
  envelope: AimContentSourceEnvelope,
): AimSemanticTaskUnderstanding | null {
  const explicit = fallbackExplicitContentCreation(envelope)
  if (explicit) return explicit

  const request = envelope.currentUserRequest.trim()
  const normalizedRequest = request.replace(/\s+/g, "")
  if (!normalizedRequest) return null

  // 问句快径防误判（2026-09-09 生产事故：对标原文长粘贴满是「为什么/是否」类
  // 反问钩子，被整段匹配成 respond，对标改写 5 连败）。三重门槛：
  //   1) 问句模式命中且（请求很短，或以问号结尾——真问题通常这么收尾）；
  //   2) 不含对标粘贴的结构标记（「对标标题：/对标原文：」带冒号的段落头）——
  //      这是素材粘贴，不是提问；口头提到「对标文案」不带冒号不算；
  //   3) 不满足则落到下方长文本 deliver 分支或 LLM 慢路径。
  const BENCHMARK_PASTE_PATTERN = /对标标题[：:]|对标原文[：:]|对标文案[：:]/
  const looksLikeQuestion = CONTENT_ANALYSIS_QUESTION_PATTERN.test(normalizedRequest)
    && (request.length <= 80 || /[？?]$/.test(normalizedRequest))
  if (looksLikeQuestion && !BENCHMARK_PASTE_PATTERN.test(normalizedRequest)) {
    return { handling: "respond", brief: request }
  }

  const materialChars = envelope.referenceMaterials.reduce((sum, item) => sum + item.content.length, 0)
    + (envelope.currentArtifact?.content?.length ?? 0)
    + envelope.relevantConversation.reduce((sum, turn) => sum + turn.content.length, 0)

  if (materialChars >= 120 || request.length >= 120) {
    const brief = request
      || envelope.currentArtifact?.content.slice(0, 400)
      || envelope.referenceMaterials[0]?.content.slice(0, 400)
      || "基于当前材料生成交付物"
    return { handling: "deliver", brief: brief.trim() }
  }

  return null
}

export function parseSemanticTaskUnderstanding(text: string): AimSemanticTaskUnderstanding {
  const handlingMatch = text.match(/\[\[AIM_HANDLING:(respond|deliver|clarify)\]\]/)
  const briefMatch = text.match(/\[\[AIM_TASK_BRIEF\]\]([\s\S]*?)\[\[\/AIM_TASK_BRIEF\]\]/)
  if (!handlingMatch || !briefMatch?.[1]?.trim()) throw new Error("语义理解协议不完整")

  const brief = briefMatch[1].trim()
  if (FORBIDDEN_ACTION_LABEL.test(brief)) throw new Error("语义理解包含业务动作标签")
  const handling = handlingMatch[1] as AimSemanticTaskUnderstanding["handling"]
  const blocks = Array.from(text.matchAll(/\[\[AIM_CLARIFICATION\]\]([\s\S]*?)\[\[\/AIM_CLARIFICATION\]\]/g))
    .map((match) => match[1].trim())
    .filter(Boolean)
  // 块内支持多行编号问题：按行拆分，去掉编号前缀，过滤空行
  const parsedQuestions = blocks
    .flatMap((block) => block.split("\n").map((line) => line.trim()))
    .map((line) => line.replace(/^[0-9一二三四五][.、）)]\s*/u, "").trim())
    .filter(Boolean)
  if (handling === "clarify" && parsedQuestions.length < 1) throw new Error("澄清协议必须包含至少一个具体问题")
  if (handling === "clarify" && parsedQuestions.length > 3) throw new Error("澄清协议最多包含三个问题")
  if (handling !== "clarify" && blocks.length > 0) throw new Error("非澄清响应不得包含澄清问题")
  const questions = parsedQuestions.slice(0, 3)

  return {
    handling,
    brief,
    ...(questions.length ? { clarificationQuestions: questions, clarificationQuestion: questions.join("\n") } : {}),
  }
}

function renderEnvelopeForUnderstanding(envelope: AimContentSourceEnvelope) {
  const conversation = envelope.relevantConversation
    .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`)
    .join("\n\n")
  const references = envelope.referenceMaterials
    .map((item) => `【参考材料：${item.title}】\n${item.content}`)
    .join("\n\n")
  return [
    `【当前用户原话】\n${envelope.currentUserRequest}`,
    conversation ? `【最近相关对话】\n${conversation}` : "",
    envelope.currentArtifact ? `【当前作品】\n${envelope.currentArtifact.content}` : "",
    references,
  ].filter(Boolean).join("\n\n")
}

export async function understandAimContentTurn(input: {
  envelope: AimContentSourceEnvelope
  complete: CompletePort
}): Promise<AimSemanticTaskUnderstanding> {
  const fastPath = resolveSemanticUnderstandingFastPath(input.envelope)
  if (fastPath) return fastPath

  const completion = await input.complete(
    promptRegistry.get(PROMPT_KEYS.semanticTaskUnderstanding).content,
    renderEnvelopeForUnderstanding(input.envelope),
  )
  try {
    return parseSemanticTaskUnderstanding(completion.content)
  } catch (error) {
    if (!(error instanceof Error) || !SEMANTIC_PROTOCOL_ERROR_PATTERN.test(error.message)) throw error
    const repaired = await input.complete(
      promptRegistry.get(PROMPT_KEYS.semanticTaskRepair).content,
      [
        `【当前用户原话】\n${input.envelope.currentUserRequest}`,
        `【上一次输出】\n${completion.content}`,
      ].join("\n\n"),
    )
    try {
      return parseSemanticTaskUnderstanding(repaired.content)
    } catch (repairError) {
      if (!(repairError instanceof Error) || !SEMANTIC_PROTOCOL_ERROR_PATTERN.test(repairError.message)) throw repairError
      const fallback = fallbackExplicitContentCreation(input.envelope)
      if (fallback) return fallback
      throw repairError
    }
  }
}

export async function understandAimContentTurnWithTrace(input: {
  envelope: AimContentSourceEnvelope
  agentId: string
  modelPolicy?: AimModelPolicy
  trace?: AimTraceRecorder
}): Promise<AimSemanticTaskUnderstanding> {
  return runAimTraceStep(
    input.trace,
    "semantic_understanding",
    "语义任务理解",
    () => understandAimContentTurn({
      envelope: input.envelope,
      complete: (systemPrompt, userPrompt) => executeGenerateLLM(
        input.agentId,
        systemPrompt,
        userPrompt,
        input.modelPolicy,
      ),
    }),
    (result) => ({
      summary: summarizeText(result.brief),
      metadata: {
        handling: result.handling,
        conversationTurns: input.envelope.relevantConversation.length,
        referenceCount: input.envelope.referenceMaterials.length,
        currentRequestChars: input.envelope.currentUserRequest.length,
      },
    }),
  )
}
