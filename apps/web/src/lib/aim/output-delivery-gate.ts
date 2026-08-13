import type { ContentFormat } from "@/lib/aim-generator"
import { stripAimFormatMarkers } from "@/lib/aim/format-marker-cleanup"
import { scrubPromptLeakageFromBody } from "@/lib/aim-generation-text"

type DeliveryProtocolErrorCode =
  | "missing_final_marker"
  | "duplicate_final_marker"
  | "empty_final_content"
  | "invalid_final_protocol"

export type StrictFormatParseResult =
  | { ok: true; contents: Partial<Record<ContentFormat, string>> }
  | { ok: false; code: DeliveryProtocolErrorCode; message: string }

export function parseStrictMultiFormatResponse(
  raw: string,
  formats: ContentFormat[],
): StrictFormatParseResult {
  const occurrences = formats.map((format) => {
    const marker = `===FORMAT:${format}===`
    return { format, marker, indexes: Array.from(raw.matchAll(new RegExp(marker, "g"))).map((match) => match.index ?? -1) }
  })
  if (occurrences.some((item) => item.indexes.length === 0)) {
    return { ok: false, code: "missing_final_marker", message: "缺少最终内容格式标记" }
  }
  if (occurrences.some((item) => item.indexes.length > 1)) {
    return { ok: false, code: "duplicate_final_marker", message: "最终内容格式标记重复" }
  }
  if (occurrences.some((item, index) => index > 0 && item.indexes[0] <= occurrences[index - 1].indexes[0])) {
    return { ok: false, code: "invalid_final_protocol", message: "最终内容格式顺序不合法" }
  }

  const contents: Partial<Record<ContentFormat, string>> = {}
  for (let index = 0; index < occurrences.length; index += 1) {
    const current = occurrences[index]
    const start = current.indexes[0] + current.marker.length
    const end = occurrences[index + 1]?.indexes[0] ?? raw.length
    const content = scrubPromptLeakageFromBody(stripAimFormatMarkers(raw.slice(start, end))).trim()
    if (!content) return { ok: false, code: "empty_final_content", message: "最终内容为空" }
    contents[current.format] = content
  }
  return { ok: true, contents }
}

const INTERNAL_META_LINES = [
  /^(好的)?老板[，,]?我先(?:把)?这轮任务在内部复述|^(好的)?老板[，,]?我先在内部复述/,
  /^内部复述[：:]/,
  /^最终决定[：:]/,
  /^我重新审视一下/,
  /^但这里有一个矛盾[：:]/,
  /^runtimeTask\s*[=:]/i,
  /^businessGoal\s*[=:]/i,
  /^AIM_INTERNAL_/,
  /^\[\[(SYSTEM|DEBUG|THOUGHT|PROMPT)/i,
]

const PROTOCOL_META_LINE = /^(?:runtimeTask\s*[=:]|businessGoal\s*[=:]|AIM_INTERNAL_|\[\[(?:SYSTEM|DEBUG|THOUGHT|PROMPT))/i
const ACCIDENT_META_LINE = /^(好的)?老板[，,]?我先(?:把)?这轮任务在内部复述|^(好的)?老板[，,]?我先在内部复述/

export function inspectAimDeliveryCandidate(input: {
  contents: Partial<Record<ContentFormat, string>>
  finishReason?: string | null
}): { passed: true } | { passed: false; code: "truncated" | "internal_meta_leak" | "empty_final_content" } {
  if (input.finishReason === "length" || input.finishReason === "max_tokens") {
    return { passed: false, code: "truncated" }
  }
  const bodies = Object.values(input.contents).filter((value): value is string => typeof value === "string")
  if (bodies.length === 0 || bodies.some((body) => body.trim().length === 0)) {
    return { passed: false, code: "empty_final_content" }
  }
  const lines = bodies.flatMap((body) => body.split(/\r?\n/).map((line) => line.trim()).filter(Boolean))
  const matches = lines.filter((line) => INTERNAL_META_LINES.some((pattern) => pattern.test(line)))
  if (matches.length >= 2 || lines.some((line) => PROTOCOL_META_LINE.test(line) || ACCIDENT_META_LINE.test(line))) {
    return { passed: false, code: "internal_meta_leak" }
  }
  return { passed: true }
}
