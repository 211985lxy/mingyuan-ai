import { LLMClient } from "@/lib/llm"
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
    maxTokens: 1500,
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
          content: [
            "你是一位顶级短视频口播文案创作者。",
            "严格按照指令创作。",
            "你不能输出错误说明、补充要求、道歉、解释或调试信息。",
            '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
            "",
            "【反AI味硬性规则——必须遵守】",
            "1. 禁用词清单（出现任何一个都是严重扣分项）：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
            "2. 禁止排比三连（三个以上相同句式连续出现）。",
            "3. 禁止'首先...其次...最后...'这类文章式过渡。",
            "4. 禁止'不是...而是...'、'与其...不如...'这类套路句式连续出现超过一次。",
            "5. 用口语化短句，像真人在跟镜头说话，不是在写公众号文章。",
            "6. 允许适度口语词（啊、呢、吧、嘛），但不要刻意堆砌。",
            "7. 每条文案前3秒必须有具体信息或反常识表述，禁止用'今天我们来聊一个...'这类万能开场。",
          ].join("\n"),
        },
        {
          role: "user",
          content:
            metaPrompt +
            "\n\n最终输出格式：JSON 对象，键名必须是 scripts，值必须是 3 条可直接朗读的纯文本字符串。不要包含任何结构标签、括号注释、错误说明或 markdown。",
        },
      ],
      temperature: attempt === 0 ? 0.85 : 0.55,
      maxTokens: 3200,
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
          content: [
            "你是一位顶级短视频口播文案创作者。",
            "你必须直接交付结果，不允许回复缺少信息、需要补充、无法执行、报错说明或调试文字。",
            '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
            "",
            "【反AI味硬性规则——必须遵守】",
            "1. 禁用词：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
            "2. 禁止排比三连、文章式过渡（首先...其次...最后...）、套路句式连续重复。",
            "3. 口语化短句，像真人跟镜头说话，前3秒必须有具体信息或反常识表述。",
          ].join("\n"),
        },
        {
          role: "user",
          content: promptText,
        },
      ],
      temperature: attempt === 0 ? 0.7 : 0.45,
      maxTokens: 3200,
      responseFormat: { type: "json_object" },
    })

    const candidates = sanitizeScriptCandidates(parseScriptCandidates(result.content))
    if (candidates.length >= 3) {
      return { candidates: candidates.slice(0, 3), promptText }
    }
  }

  throw new Error("[script-generator] Direct recovery candidates invalid")
}
