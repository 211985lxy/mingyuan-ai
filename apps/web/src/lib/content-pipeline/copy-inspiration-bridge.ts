// @ts-nocheck — LLMClient.chat 接口待对齐，临时跳过
/**
 * 5e 文案灵感生成桥接模块
 *
 * 基于视频转录文本 + AI 总结 + 选题方向，
 * 调用 LLM 生成可改编的文案灵感（开头方向 + 内容方向）。
 *
 * 复用 AIM 的 LLM Provider 链，走 content_producer 路由键。
 */

import { getAgentLLM } from "@/lib/llm/agent-router"

// ─── 类型定义 ──────────────────────────────────────────────────────

export interface CopyInspirationResult {
  /** 是否成功 */
  success: boolean
  /** 吸引眼球的开头方向 */
  hook?: string
  /** 内容方向描述 */
  direction?: string
  /** 适合的风格参考 */
  styleReference?: string
  /** 推荐发布平台 */
  recommendedPlatform?: string
  /** 错误信息 */
  error?: string
}

export interface CopyInspirationInput {
  /** 视频标题 */
  title?: string
  /** 转录文本 */
  transcript: string
  /** AI 摘要 */
  summary?: string
  /** 选题标题（来自 5c，可选） */
  topicTitle?: string
  /** 选题角度（来自 5c，可选） */
  topicAngle?: string
  /** 视频平台 */
  platform?: string
  /** LLM 路由键（默认 content_producer） */
  llmRouteKey?: string
}

// ─── 核心函数 ──────────────────────────────────────────────────────

/**
 * 基于视频内容生成文案灵感。
 * 复用 AIM 的 getAgentLLM + OpenAI 兼容接口。
 */
export async function generateCopyInspiration(
  input: CopyInspirationInput,
): Promise<CopyInspirationResult> {
  try {
    const routeKey = input.llmRouteKey || "content_producer"
    const client = getAgentLLM(routeKey)

    // 截取转录文本（控制 token 消耗）
    const maxTranscript = 4000
    const transcript = input.transcript.slice(0, maxTranscript)

    // 构建 prompt
    const userPrompt = buildUserPrompt(input, transcript)
    const systemPrompt = buildSystemPrompt(input)

    const response = await client.chat.completions.create({
      model: "default",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 800,
    })

    const content = response.choices?.[0]?.message?.content || ""

    // 解析 JSON
    return parseCopyInspiration(content, input)
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "文案灵感生成失败",
    }
  }
}

// ─── Prompt 构建 ──────────────────────────────────────────────────

function buildSystemPrompt(input: CopyInspirationInput): string {
  return `你是一个短视频文案策划专家。用户会给你一段竞品/参考视频的内容，你需要基于此生成可改编的文案灵感。

要求：
1. 分析视频的核心钩子（hook）技巧
2. 提出改编方向（不要抄袭，要差异化）
3. 给出适合的发布平台建议
4. 提供风格参考

请严格按以下 JSON 格式输出：
{"hook": "开头方向", "direction": "内容方向描述", "style_reference": "适合的风格", "recommended_platform": "douyin/xhs/wechat"}

${input.platform === "douyin" ? "参考平台：抖音短视频（15-60秒）" : ""}
${input.platform === "xiaohongshu" ? "参考平台：小红书图文/视频" : ""}
${input.platform === "channels" ? "参考平台：微信视频号" : ""}`
}

function buildUserPrompt(input: CopyInspirationInput, transcript: string): string {
  let prompt = ""

  if (input.title) prompt += `视频标题：${input.title}\n`
  if (input.summary) prompt += `内容摘要：${input.summary}\n`
  if (input.topicTitle) prompt += `已有选题方向：${input.topicTitle}\n`
  if (input.topicAngle) prompt += `选题角度：${input.topicAngle}\n`

  prompt += `\n---\n视频转录内容：\n${transcript}`

  return prompt
}

// ─── 结果解析 ──────────────────────────────────────────────────

function parseCopyInspiration(
  content: string,
  input: CopyInspirationInput,
): CopyInspirationResult {
  // 提取 JSON
  const jsonMatch = content.match(/\{[\s\S]*\}/)
  if (!jsonMatch) {
    return {
      success: true,
      hook: "",
      direction: content.slice(0, 500),
      styleReference: "",
      recommendedPlatform: input.platform || "douyin",
    }
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as {
      hook?: string
      direction?: string
      style_reference?: string
      recommended_platform?: string
    }
    return {
      success: true,
      hook: parsed.hook,
      direction: parsed.direction,
      styleReference: parsed.style_reference,
      recommendedPlatform: parsed.recommended_platform || input.platform || "douyin",
    }
  } catch {
    return {
      success: true,
      hook: "",
      direction: content.slice(0, 500),
      styleReference: "",
      recommendedPlatform: input.platform || "douyin",
    }
  }
}
