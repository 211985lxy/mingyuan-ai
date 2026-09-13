import { LLMClient } from "@/lib/llm"
import { promptRegistry } from "@/lib/prompt/registry"
import { PROMPT_KEYS } from "@/lib/prompt/types"
import { buildDirectGenerationPrompt, buildMetaPromptText } from "./prompts"
import { buildMetaPromptMessages } from "./meta-prompt"
import { parseScriptCandidates, parseScriptDirections, sanitizeScriptCandidates } from "./parsing"
import type { GenerateScriptCandidatesParams } from "./contracts"
import { META_MODEL, SCRIPT_MODEL } from "./models"

/**
 * @description 生成metaprompt
 * @param llm - 大语言模型
 * @param contextBlock - 上下文块
 * @param params - 参数对象
 * @returns Promise<string>
 */
export async function generateMetaPrompt(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<string> {
  const result = await llm.complete({
    model: META_MODEL,
    messages: buildMetaPromptMessages(contextBlock, params),
    temperature: 0.4,
    maxTokens: 8192,
    responseFormat: { type: "json_object" },
  })

  const directions = parseScriptDirections(result.content)
  if (directions.length < 3) {
    console.warn("[script-generator] Meta prompt directions invalid, got", directions.length, "valid directions from:", result.content.slice(0, 300))
    throw new Error("[script-generator] Meta prompt directions invalid")
  }

  return buildMetaPromptText(contextBlock, params, directions)
}

// ─── Step 2: Generate scripts using meta-prompt ────────────

/**
 * @description 生成scriptswithprompt
 * @param llm - 大语言模型
 * @param metaPrompt - meta提示词
 * @returns Promise<string[]>
 */
export async function generateScriptsWithPrompt(
  llm: LLMClient,
  metaPrompt: string,
): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      model: SCRIPT_MODEL,
      messages: [
        {
          role: "system",
          content: promptRegistry.get(PROMPT_KEYS.scriptGenerationWithPromptSystem).content,
        },
        {
          role: "user",
          content:
            metaPrompt +
            "\n\n最终输出格式：JSON 对象，键名必须是 scripts，值必须是 3 条可直接朗读的纯文本字符串。不要包含任何结构标签、括号注释、错误说明或 markdown。",
        },
      ],
      temperature: attempt === 0 ? 0.85 : 0.55,
      maxTokens: 8192,
      responseFormat: { type: "json_object" },
    })

    const candidates = sanitizeScriptCandidates(parseScriptCandidates(result.content))
    if (candidates.length >= 3) {
      return candidates.slice(0, 3)
    }
  }

  throw new Error("[script-generator] Script candidates invalid")
}

/**
 * @description 生成scriptsdirectly
 * @param llm - 大语言模型
 * @param contextBlock - 上下文块
 * @param params - 参数对象
 * @returns Promise<
 */
export async function generateScriptsDirectly(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<{ candidates: string[]; promptText: string }> {
  const promptText = buildDirectGenerationPrompt(contextBlock, params)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      model: SCRIPT_MODEL,
      messages: [
        {
          role: "system",
          content: promptRegistry.get(PROMPT_KEYS.scriptGenerationDirectSystem).content,
        },
        {
          role: "user",
          content: promptText,
        },
      ],
      temperature: attempt === 0 ? 0.7 : 0.45,
      maxTokens: 8192,
      responseFormat: { type: "json_object" },
    })

    const candidates = sanitizeScriptCandidates(parseScriptCandidates(result.content))
    if (candidates.length >= 3) {
      return { candidates: candidates.slice(0, 3), promptText }
    }
  }

  throw new Error("[script-generator] Direct recovery candidates invalid")
}
