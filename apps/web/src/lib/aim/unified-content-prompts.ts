import type { AimGenerateContext } from "@/lib/aim/agent-types"
import { AIM_ASSISTANT_PERSONA } from "@/lib/aim/assistant-persona"
import type { AimContentGoal, ResolvedUserIntent } from "@/lib/aim/resolved-user-intent"
import { promptRegistry } from "@/lib/prompt/registry"
import { fillPromptTemplate } from "@/lib/prompt/template"
import { PROMPT_KEYS } from "@/lib/prompt/types"

const GOAL_LABELS: Record<AimContentGoal, string> = {
  traffic: "搞流量",
  lead: "获客咨询",
  convert: "成交转化",
  trust: "建立人设信任",
  brand: "品牌",
}

function buildConfirmedIntentBlock(intent?: ResolvedUserIntent): string {
  if (!intent) return ""
  const lines: string[] = []
  if (intent.modificationScope) lines.push(`修改范围：${intent.modificationScope}`)
  if (intent.lengthPolicy === "user_explicit" && intent.lengthText) {
    lines.push(`长度要求：${intent.lengthText}`)
  } else if (intent.lengthPolicy === "keep_original") {
    lines.push("长度要求：保持原稿体量")
  }
  if (typeof intent.quantity === "number") lines.push(`数量：${intent.quantity}`)
  if (intent.goal) lines.push(`内容目标：${GOAL_LABELS[intent.goal]}`)
  if (!lines.length) return ""
  return `【已确认要求】\n${lines.join("\n")}`
}

function optionalBlock(text: string): string {
  return text ? `\n\n${text}` : ""
}

export function buildUnifiedProducerSystemPrompt(context: AimGenerateContext): string {
  const authorizedContext = [
    context.ipWikiBlock ? `【IP 档案（用户确认的一手事实）】\n${context.ipWikiBlock}` : "",
    context.knowledgeBlock ? `授权知识：\n${context.knowledgeBlock}` : "",
    context.selectedMethodologyBlock ? `用户选定方法论：\n${context.selectedMethodologyBlock}` : "",
    context.methodologyBlock ? `按需方法论：\n${context.methodologyBlock}` : "",
  ].filter(Boolean).join("\n\n")
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.unifiedProducerSystem).content,
    {
      persona: AIM_ASSISTANT_PERSONA,
      authorizedContextSection: authorizedContext ? `${authorizedContext}\n\n` : "",
    },
  )
}

export function buildUnifiedProducerUserPrompt(context: AimGenerateContext, formatBlocks: string): string {
  const execution = context.unifiedContentExecution
  if (!execution) throw new Error("统一内容执行缺少来源信封")
  const { envelope, brief, intent } = execution
  const conversation = envelope.relevantConversation
    .map((turn) => `${turn.role === "user" ? "用户" : "助手"}：${turn.content}`)
    .join("\n\n")
  const references = envelope.referenceMaterials
    .map((item) => `【参考材料：${item.title}】\n${item.content}`)
    .map((item) => optionalBlock(item))
    .join("")
  return fillPromptTemplate(
    promptRegistry.get(PROMPT_KEYS.unifiedProducerUser).content,
    {
      currentUserRequest: envelope.currentUserRequest,
      brief,
      confirmedIntent: optionalBlock(buildConfirmedIntentBlock(intent)),
      conversation: conversation ? optionalBlock(`【最近相关对话】\n${conversation}`) : "",
      currentArtifact: envelope.currentArtifact
        ? optionalBlock(`【当前作品】\n${envelope.currentArtifact.content}`)
        : "",
      references,
      methodologyNotes: envelope.methodologyNotes
        ? optionalBlock(`【方法论】\n${envelope.methodologyNotes}`)
        : "",
      ipWiki: context.ipWikiBlock ? optionalBlock(`【IP 档案】\n${context.ipWikiBlock}`) : "",
      knowledge: context.knowledgeBlock ? optionalBlock(`【授权知识】\n${context.knowledgeBlock}`) : "",
      selectedMethodology: context.selectedMethodologyBlock
        ? optionalBlock(`【用户选定方法论】\n${context.selectedMethodologyBlock}`)
        : "",
      methodology: context.methodologyBlock
        ? optionalBlock(`【按需方法论】\n${context.methodologyBlock}`)
        : "",
      formatMarkers: context.targetFormats.map((format) => `===FORMAT:${format}===`).join("\n"),
      formatBlocks,
    },
  )
}
