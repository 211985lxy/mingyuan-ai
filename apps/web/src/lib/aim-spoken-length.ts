import type { ContentFormat } from "./aim-generator"
import { redactApprovedFactsForRewrite } from "./aim-generation-guardrails"

const METHOD_NOTE_BLOCK = /\[\[AIM_METHOD_NOTE\]\][\s\S]*?\[\[\/AIM_METHOD_NOTE\]\]/
const SHORT_OUTPUT_REQUEST = /(一句话?|标题|口号|金句|不超过\s*\d+\s*字|\d+\s*字以内|(?:10|15|20)\s*秒)/
const SPOKEN_SCRIPT_FORMATS = new Set<ContentFormat>(["video_script", "koubo_script"])
const SPOKEN_ACTION_PATTERN = /先|再|然后|建议|做法|方法|建立|固定|校准|检查|复盘|行动/u
const SPOKEN_CAUSE_PATTERN = /因为|原因|问题在|为什么|导致|所以/u

interface SpokenLengthBounds {
  min: number
  max: number
  targetMin: number
  targetMax: number
}

/**
 * 解析用户显式给出的时长要求（X分钟 / X到Y分钟 / X秒）。
 * 用户没有给时长时返回 null：长度不再是隐藏默认约束（用户指令唯一真源整改），
 * 只有完整性（截断/半句话）才算不合格，绝不偷偷注入"默认2分钟/400-500字"。
 */
export function requestedSpokenLengthBounds(rawInput: string): SpokenLengthBounds | null {
  // 用户显式字数区间（如"400-550字"）优先级最高：直接作为验收边界
  const wordRange = rawInput.match(/(\d{2,4})\s*(?:到|至|[-~—])\s*(\d{2,4})\s*字/)
  if (wordRange) {
    const rangeMin = Number(wordRange[1])
    const rangeMax = Number(wordRange[2])
    if (rangeMin > 0 && rangeMax >= rangeMin) {
      return { min: rangeMin, max: rangeMax, targetMin: rangeMin, targetMax: rangeMax }
    }
  }
  const minuteRange = rawInput.match(
    /(\d+(?:\.\d+)?)\s*(?:分钟|分)?\s*(?:到|至|[-~—])\s*(\d+(?:\.\d+)?)\s*(?:分钟|分)/,
  )
  const singleMinutes = rawInput.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分)/)?.[1]
  const seconds = rawInput.match(/(\d{2,3})\s*秒/)?.[1]
  if (!minuteRange && !singleMinutes && !seconds) {
    // 单一明确字数（如"写500字"）也按用户要求换算边界
    const exactWords = rawInput.match(/(?:写|控制在|生成|输出|篇幅|字数|目标)\s*(\d{2,4})\s*个?字/)
    if (exactWords) {
      const target = Number(exactWords[1])
      if (target >= 20) {
        return { min: Math.floor(target * 0.85), max: Math.ceil(target * 1.1), targetMin: target, targetMax: target }
      }
    }
    return null
  }
  let minMinutes = minuteRange
    ? Number(minuteRange[1])
    : singleMinutes
      ? Number(singleMinutes)
      : Number(seconds) / 60
  let maxMinutes = minuteRange ? Number(minuteRange[2]) : minMinutes
  if (
    !Number.isFinite(minMinutes)
    || !Number.isFinite(maxMinutes)
    || minMinutes <= 0
    || maxMinutes <= 0
  ) {
    return null
  }
  // 显式但超出支持范围（<10秒 或 >10分钟）时收敛到边界，而不是丢弃用户要求换成默认值
  minMinutes = Math.min(Math.max(minMinutes, 1 / 6), 10)
  maxMinutes = Math.min(Math.max(maxMinutes, minMinutes), 10)
  const targetMin = Math.floor(minMinutes * 200)
  const targetMax = Math.ceil(maxMinutes * (minuteRange ? 200 : 250))
  return {
    min: Math.floor(targetMin * 0.85),
    max: Math.ceil(targetMax * 1.1),
    targetMin,
    targetMax,
  }
}

function countSpokenCharacters(content: string): number {
  return (content.match(/[\p{Script=Han}\p{Letter}\p{Number}]/gu) ?? []).length
}

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

export function fitOverlongSpokenContent(content: string, rawInput: string): string {
  const bounds = requestedSpokenLengthBounds(rawInput)
  // 用户没给时长就没有超长裁剪：不做任何静默删句（隐藏默认值整改）
  if (!bounds) return content
  if (countSpokenCharacters(content) <= bounds.max) return content

  const painTerms = (rawInput.match(/痛点是([^。]+)/u)?.[1] || "")
    .split(/[、，,；;]/u)
    .map((term) => term.trim().replace(/重$/u, ""))
    .filter((term) => term.length >= 2)
  const paragraphs = content.split(/\n{2,}/u)
  const units = paragraphs.flatMap((paragraph, paragraphIndex) => {
    const sentences = paragraph.match(/[^。！？!?]+[。！？!?]?/gu) ?? [paragraph]
    return sentences.map((text) => ({ paragraphIndex, text, removed: false }))
  })
  if (units.length < 4) return content

  const lastIndex = units.length - 1
  const isProtected = (unit: typeof units[number], index: number) =>
    index === 0
    || index === lastIndex
    || /\d/u.test(unit.text)
    || painTerms.some((term) => unit.text.includes(term))
  const categoryCount = (pattern: RegExp) => units.filter((unit) =>
    !unit.removed && pattern.test(unit.text)).length

  while (countSpokenCharacters(units.filter((unit) => !unit.removed).map((unit) => unit.text).join("")) > bounds.targetMax) {
    const candidates = units
      .map((unit, index) => ({ unit, index }))
      .filter(({ unit, index }) => {
        if (unit.removed || isProtected(unit, index)) return false
        if (SPOKEN_ACTION_PATTERN.test(unit.text) && categoryCount(SPOKEN_ACTION_PATTERN) <= 1) return false
        if (SPOKEN_CAUSE_PATTERN.test(unit.text) && categoryCount(SPOKEN_CAUSE_PATTERN) <= 1) return false
        const remaining = units
          .filter((candidate) => !candidate.removed && candidate !== unit)
          .map((candidate) => candidate.text)
          .join("")
        return countSpokenCharacters(remaining) >= bounds.min
      })
      .sort((left, right) => {
        const score = (text: string) =>
          (SPOKEN_ACTION_PATTERN.test(text) ? 2 : 0)
          + (SPOKEN_CAUSE_PATTERN.test(text) ? 1 : 0)
        return score(left.unit.text) - score(right.unit.text)
          || countSpokenCharacters(right.unit.text) - countSpokenCharacters(left.unit.text)
      })
    if (!candidates.length) break
    candidates[0].unit.removed = true
  }

  const fitted = paragraphs
    .map((_, paragraphIndex) => units
      .filter((unit) => unit.paragraphIndex === paragraphIndex && !unit.removed)
      .map((unit) => unit.text)
      .join("")
      .trim())
    .filter(Boolean)
    .join("\n\n")
  const fittedLength = countSpokenCharacters(fitted)
  return fittedLength >= bounds.min && fittedLength <= bounds.max ? fitted : content
}

export function findIncompleteGenerationFormats(input: {
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  rawInput: string
  finishReason?: string | null
  enforceSpokenLength?: boolean
}): ContentFormat[] {
  const allowsShort = SHORT_OUTPUT_REQUEST.test(input.rawInput)
  const spokenLengthBounds = requestedSpokenLengthBounds(input.rawInput)
  const isTruncated = input.finishReason === "length"

  return input.targetFormats.filter((format) => {
    const body = (input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "").trim()
    if (!body) return true
    if (/[，,：:]$/u.test(body)) return true
    if (input.enforceSpokenLength === false || !isSpokenScriptFormat(format) || allowsShort) {
      return isTruncated && body.length < 10
    }
    // 用户未指定时长：只按完整性判定（截断/半句话/无终止标点），长度下限不作为隐藏门槛
    if (!spokenLengthBounds) {
      if (isTruncated && body.length < 10) return true
      return !/[。！？!?…”』」）)\]]\s*$/u.test(body)
    }
    const spokenCharacters = countSpokenCharacters(body)
    return spokenCharacters < spokenLengthBounds.min
  })
}

export function findOverlongGenerationFormats(input: {
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  rawInput: string
}): ContentFormat[] {
  if (SHORT_OUTPUT_REQUEST.test(input.rawInput)) return []
  const bounds = requestedSpokenLengthBounds(input.rawInput)
  // 用户未指定时长：没有超长上限，不触发压缩重试
  if (!bounds) return []
  const spokenLengthCeiling = bounds.max
  return input.targetFormats.filter((format) => {
    if (!isSpokenScriptFormat(format)) return false
    const body = (input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "").trim()
    return countSpokenCharacters(body) > spokenLengthCeiling
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
  const bounds = requestedSpokenLengthBounds(input.rawInput)
  return {
    attempt: input.attempt,
    acceptedRange: bounds ? `${bounds.min}-${bounds.max}` : "未指定（仅完整性校验）",
    targetRange: bounds ? `${bounds.targetMin}-${bounds.targetMax}` : "未指定",
    lengths: Object.fromEntries(input.targetFormats.map((format) => [
      format,
      countSpokenCharacters((input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "")),
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
  const bounds = requestedSpokenLengthBounds(input.rawInput)
  const hasSpokenFormat = input.targetFormats.some(isSpokenScriptFormat)
  const lengthIssue = input.overlongFormats.length
    ? `上一版篇幅超出你指定的时长范围，不能交付。请把 ${input.overlongFormats.join("、")} 压缩到 ${bounds?.targetMin}-${bounds?.targetMax} 个有效字符。`
    : `上一版在正文中途结束或篇幅不足，不能交付。请重新完整输出 ${input.incompleteFormats.join("、")}。`
  const previousOutput = input.targetFormats
    .map((format) => `===FORMAT:${format}===\n${redactApprovedFactsForRewrite(
      input.parsed[format] || "",
      input.rawInput,
    )}`)
    .join("\n\n")
  return `${input.userPrompt}

【完整性重试】
${lengthIssue}
- 减少内部推理，优先保证正文完整。
${hasSpokenFormat
    ? bounds
      ? `- 口播必须有完整开头、展开和收束，禁止停在半句话。\n- 用户指定的篇幅目标是 ${bounds.targetMin}-${bounds.targetMax} 个有效字符，验收范围是 ${bounds.min}-${bounds.max}，不得用重复句凑长度。`
      : "- 口播必须有完整开头、展开和收束，禁止停在半句话；用户未指定时长，长度由内容自然收束决定，不设默认字数。"
    : "- 保持用户要求的修改范围，只补齐中断的句子并完整收束，不要扩写成另一篇。"}
- 每种格式都必须以完整句子结束，并保留 ===FORMAT:格式名=== 标记。

请基于下面的上一版定向压缩或补全，不要另起主题、不要新增用户未确认的字数/数量/结构要求；事实标记必须原样保留：
${previousOutput}`
}
