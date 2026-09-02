import type { ContentFormat } from "./aim-generator"
import { redactApprovedFactsForRewrite } from "./aim-generation-guardrails"

/**
 * 口播交付的完整性检查（与字数无关）。
 *
 * 用户指令唯一真源——字数/时长永远不做代码级口径：
 * - 用户原话给了长度 → 只作为提示词要求交给模型照办；
 * - 用户没给长度 → 自然收束，不追问、不默认、不设验收区间；
 * - 这里只拦「空正文 / 停在半句话 / 无终止标点的截断」这类结构性残缺。
 */

const METHOD_NOTE_BLOCK = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/
const SPOKEN_SCRIPT_FORMATS = new Set<ContentFormat>(["video_script", "koubo_script"])

export function isSpokenScriptFormat(format: ContentFormat): boolean {
  return SPOKEN_SCRIPT_FORMATS.has(format)
}

export function cleanSpokenDeliveryArtifacts(content: string): string {
  return content
    .split(/\n{2,}/u)
    .map((paragraph) => paragraph
      .replace(/\s*适合谁[？?]\s*不适合谁[？?]\s*$/u, "")
      .trim())
    .filter(Boolean)
    .join("\n\n")
}

export function findIncompleteGenerationFormats(input: {
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  rawInput: string
  finishReason?: string | null
  enforceSpokenLength?: boolean
}): ContentFormat[] {
  const isTruncated = input.finishReason === "length" || input.finishReason === "max_tokens"

  return input.targetFormats.filter((format) => {
    const body = (input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "").trim()
    if (!body) return true
    if (/[，,：:]$/u.test(body)) return true
    if (isSpokenScriptFormat(format) && input.enforceSpokenLength !== false) {
      // 截断且几乎没内容（<80 字，与末次交付实质性阈值一致）= 结构性残缺，不是字数口径
      if (isTruncated && body.length < 80) return true
      // 口播截断常以无终止标点的半句收尾；这是完整性信号，不是长度口径
      return !/[。！？!?…”』」）)\]]\s*$/u.test(body)
    }
    return isTruncated && body.length < 10
  })
}

export function getSpokenLengthGateDiagnostics(input: {
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  rawInput: string
  attempt: number
  incompleteFormats: ContentFormat[]
  overlongFormats: ContentFormat[]
}) {
  return {
    attempt: input.attempt,
    lengths: Object.fromEntries(input.targetFormats.map((format) => [
      format,
      (input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "").length,
    ])),
    incompleteFormats: input.incompleteFormats,
    overlongFormats: input.overlongFormats,
  }
}

export function buildSpokenLengthRetryPrompt(input: {
  userPrompt: string
  rawInput: string
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  incompleteFormats: ContentFormat[]
  overlongFormats: ContentFormat[]
}): string {
  const hasSpokenFormat = input.targetFormats.some(isSpokenScriptFormat)
  const issue = `上一版在正文中途结束或内容不完整，不能交付。请重新完整输出 ${input.incompleteFormats.join("、")}。`
  const previousOutput = input.targetFormats
    .map((format) => `===FORMAT:${format}===\n${redactApprovedFactsForRewrite(
      input.parsed[format] || "",
      input.rawInput,
    )}`)
    .join("\n\n")
  return `${input.userPrompt}

【完整性重试】
${issue}
- 减少内部推理，优先保证正文完整。
${hasSpokenFormat
    ? "- 口播必须有完整开头、展开和收束，禁止停在半句话；篇幅只按用户原话执行，用户没提长度就自然收束，不设任何默认字数。"
    : "- 保持用户要求的修改范围，只补齐中断的句子并完整收束，不要扩写成另一篇。"}
- 每种格式都必须以完整句子结束，并保留 ===FORMAT:格式名=== 标记。

请基于下面的上一版补全，不要另起主题、不要新增用户未确认的字数/数量/结构要求；事实标记必须原样保留：
${previousOutput}`
}
