import { LLMClient } from "@/lib/llm"
import { getStyleProfileBlock } from "@/lib/style-profile"
import { getStylePromptBlock, STYLE_GUIDE_IDS, type StyleGuideId } from "@/lib/style-guide-config"
import { loadProjectKnowledge } from "./script-polish-context"
import {
  buildImitateMessages,
  buildPolishInstructions,
  buildPolishMessages,
  buildProofreadMessages,
} from "./script-polish-prompts"

const POLISH_MODEL = process.env.POLISH_MODEL || process.env.SCRIPT_POLISH_MODEL

type PolishMode = "proofread" | "imitate" | "polish"

export interface ScriptPolishInput {
  content: string
  weakDimensions: string[]
  topicTitle: string | null
  persona: string | null
  projectId?: string
  viralSourceText: string
  styleId?: StyleGuideId
  mode: PolishMode
}

type ScriptPolishResult =
  | { ok: true; data: { original: string; polished: string; polishedDimensions: string[] } }
  | { ok: false; error: string; status: 400 | 500 | 503 }

/**
 * @description 解析scriptpolishbody
 * @param body - 请求体
 * @returns ScriptPolishInput
 */
export function parseScriptPolishBody(body: Record<string, unknown>): ScriptPolishInput {
  const mode: PolishMode = body.mode === "proofread"
    ? "proofread"
    : body.mode === "imitate"
      ? "imitate"
      : "polish"
  return {
    content: typeof body.content === "string" ? body.content.trim() : "",
    weakDimensions: Array.isArray(body.weakDimensions) ? body.weakDimensions as string[] : [],
    topicTitle: typeof body.topicTitle === "string" ? body.topicTitle : null,
    persona: typeof body.persona === "string" ? body.persona : null,
    projectId: typeof body.projectId === "string" && body.projectId ? body.projectId : undefined,
    viralSourceText: typeof body.viralSourceText === "string" ? body.viralSourceText.trim() : "",
    styleId: typeof body.styleId === "string" && (STYLE_GUIDE_IDS as string[]).includes(body.styleId)
      ? body.styleId as StyleGuideId
      : undefined,
    mode,
  }
}

function cleanPolished(content: string, labels: RegExp[]): string {
  return labels.reduce((value, label) => value.replace(label, ""), content).trim()
}

function success(input: ScriptPolishInput, polished: string, dimensions: string[]): ScriptPolishResult {
  return { ok: true, data: { original: input.content, polished, polishedDimensions: dimensions } }
}

async function runImitate(
  llm: ReturnType<typeof LLMClient.shared>,
  userId: string,
  input: ScriptPolishInput,
): Promise<ScriptPolishResult> {
  if (!input.viralSourceText || input.viralSourceText.length < 30) {
    return { ok: false, error: "请提供对标爆款原文", status: 400 }
  }
  if (!input.content || input.content.length < 30) {
    return { ok: false, error: "草稿内容不能为空", status: 400 }
  }

  const [styleProfileBlock, knowledgeBlock] = await Promise.all([
    getStyleProfileBlock(userId, input.projectId ?? null).catch(() => ""),
    loadProjectKnowledge(userId, input.projectId),
  ])
  const contextBlock = [
    knowledgeBlock,
    styleProfileBlock,
    input.persona ? `\nIP 人设：${input.persona}` : null,
  ].filter(Boolean).join("\n")
  const result = await llm.complete({
    model: POLISH_MODEL,
    messages: buildImitateMessages({
      contextBlock,
      styleOverrideBlock: getStylePromptBlock(input.styleId),
      viralSourceText: input.viralSourceText,
      content: input.content,
      topicTitle: input.topicTitle,
    }),
    temperature: 0.7,
    maxTokens: 2000,
  })
  const polished = cleanPolished(result.content, [
    /^【[^】]+】\s*/g,
    /^仿写后[：:]\s*/gi,
    /^修改后[：:]\s*/gi,
  ])
  if (!polished || polished.length < 30) {
    return { ok: false, error: "仿写结果无效，请重试", status: 500 }
  }
  return success(input, polished, input.styleId ? ["imitate", input.styleId] : ["imitate"])
}

async function runProofread(
  llm: ReturnType<typeof LLMClient.shared>,
  input: ScriptPolishInput,
): Promise<ScriptPolishResult> {
  const result = await llm.complete({
    model: POLISH_MODEL,
    messages: buildProofreadMessages(input.content),
    temperature: 0.1,
    maxTokens: 2000,
  })
  const polished = cleanPolished(result.content, [/^校对后[：:]\s*/gi, /^修改后[：:]\s*/gi])
  if (!polished || polished.length < 30) {
    return { ok: false, error: "校对结果无效，请重试", status: 500 }
  }
  return success(input, polished, ["proofread"])
}

async function runPolish(
  llm: ReturnType<typeof LLMClient.shared>,
  userId: string,
  input: ScriptPolishInput,
): Promise<ScriptPolishResult> {
  const styleProfileBlock = await getStyleProfileBlock(userId, input.projectId ?? null).catch(() => "")
  const contextSection = [
    input.topicTitle ? `选题方向：${input.topicTitle}` : null,
    input.persona ? `IP人设：${input.persona}` : null,
    styleProfileBlock ? `写作风格档案：\n${styleProfileBlock}` : null,
  ].filter(Boolean).join("\n")
  const result = await llm.complete({
    model: POLISH_MODEL,
    messages: buildPolishMessages({
      content: input.content,
      contextSection,
      polishInstructions: buildPolishInstructions(input.weakDimensions),
    }),
    temperature: 0.4,
    maxTokens: 2000,
  })
  const polished = cleanPolished(result.content, [
    /^【[^】]+】\s*/g,
    /^润色后[：:]\s*/gi,
    /^修改后[：:]\s*/gi,
  ])
  if (!polished || polished.length < 30) {
    return { ok: false, error: "润色结果无效，请重试", status: 500 }
  }
  return success(input, polished, input.weakDimensions)
}

/**
 * @description 运行scriptpolish
 * @param userId - 用户 ID
 * @param input - 输入数据
 * @returns Promise<ScriptPolishResult>
 */
export async function runScriptPolish(userId: string, input: ScriptPolishInput): Promise<ScriptPolishResult> {
  if (!input.content || input.content.length < 30) {
    return { ok: false, error: "文案内容不能为空", status: 400 }
  }
  const llm = LLMClient.shared()
  if (!llm.available) {
    return { ok: false, error: "AI 服务暂时不可用", status: 503 }
  }
  if (input.mode === "imitate") return runImitate(llm, userId, input)
  if (input.mode === "proofread") return runProofread(llm, input)
  return runPolish(llm, userId, input)
}
