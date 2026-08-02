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

function requestedSpokenLengthBounds(rawInput: string): SpokenLengthBounds {
  const minuteRange = rawInput.match(
    /(\d+(?:\.\d+)?)\s*(?:分钟|分)?\s*(?:到|至|[-~—])\s*(\d+(?:\.\d+)?)\s*(?:分钟|分)/,
  )
  const singleMinutes = rawInput.match(/(\d+(?:\.\d+)?)\s*(?:分钟|分)/)?.[1]
  const seconds = rawInput.match(/(\d{2,3})\s*秒/)?.[1]
  const minMinutes = minuteRange
    ? Number(minuteRange[1])
    : singleMinutes
      ? Number(singleMinutes)
      : seconds
        ? Number(seconds) / 60
        : 2
  const maxMinutes = minuteRange ? Number(minuteRange[2]) : minMinutes
  if (
    !Number.isFinite(minMinutes)
    || !Number.isFinite(maxMinutes)
    || minMinutes < 1 / 6
    || maxMinutes > 10
    || minMinutes > maxMinutes
  ) {
    return { min: 330, max: 550, targetMin: 400, targetMax: 500 }
  }
  const targetMin = Math.floor(minMinutes * 200)
  const targetMax = Math.ceil(maxMinutes * (minuteRange ? 200 : 250))
  return {
    min: minMinutes === 2 && maxMinutes === 2 ? 330 : Math.floor(targetMin * 0.85),
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
  if (input.finishReason === "length") return [...input.targetFormats]
  const allowsShort = SHORT_OUTPUT_REQUEST.test(input.rawInput)
  const spokenLengthFloor = requestedSpokenLengthBounds(input.rawInput).min

  return input.targetFormats.filter((format) => {
    const body = (input.parsed[format] || "").replace(METHOD_NOTE_BLOCK, "").trim()
    if (!body) return true
    if (/[，,：:]$/u.test(body)) return true
    if (input.enforceSpokenLength === false || !isSpokenScriptFormat(format) || allowsShort) return false
    const spokenCharacters = countSpokenCharacters(body)
    // 按用户要求的时长验收有效字数；短于 2 分钟的完整口播不再因为没有句末标点
    // 被误判为“截断”，模型的 finishReason=length 和时长下限已经覆盖真正截断。
    return spokenCharacters < spokenLengthFloor
  })
}

export function findOverlongGenerationFormats(input: {
  parsed: Partial<Record<ContentFormat, string | undefined>>
  targetFormats: ContentFormat[]
  rawInput: string
}): ContentFormat[] {
  if (SHORT_OUTPUT_REQUEST.test(input.rawInput)) return []
  const spokenLengthCeiling = requestedSpokenLengthBounds(input.rawInput).max
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
    acceptedRange: `${bounds.min}-${bounds.max}`,
    targetRange: `${bounds.targetMin}-${bounds.targetMax}`,
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
    ? `上一版篇幅过长，不能交付。请把 ${input.overlongFormats.join("、")} 压缩到 ${bounds.targetMin}-${bounds.targetMax} 个有效字符。`
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
    ? `- 口播必须有完整开头、展开和收束，禁止停在半句话。\n- 正文目标是 ${bounds.targetMin}-${bounds.targetMax} 个有效字符，验收范围是 ${bounds.min}-${bounds.max}，不得用重复句凑长度。`
    : "- 保持用户要求的修改范围，只补齐中断的句子并完整收束，不要扩写成另一篇。"}
- 每种格式都必须以完整句子结束，并保留 ===FORMAT:格式名=== 标记。

请基于下面的上一版定向压缩或扩写，不要另起主题；事实标记必须原样保留：
${previousOutput}`
}
