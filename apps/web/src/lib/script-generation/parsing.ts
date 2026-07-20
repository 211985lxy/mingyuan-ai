import type { ScriptDirection } from "./contracts"

/**
 * @description 解析scriptcandidates
 * @param content - 内容
 * @returns string[]
 */
export function parseScriptCandidates(content: string): string[] {
  const jsonCandidates = [
    content.trim(),
    content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim(),
    (() => {
      const start = content.indexOf("[")
      const end = content.lastIndexOf("]")
      return start !== -1 && end > start ? content.slice(start, end + 1) : ""
    })(),
    (() => {
      const start = content.indexOf("{")
      const end = content.lastIndexOf("}")
      return start !== -1 && end > start ? content.slice(start, end + 1) : ""
    })(),
  ]

  for (const raw of jsonCandidates) {
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw)
      const arr = Array.isArray(parsed)
        ? parsed
        : parsed?.candidates ?? parsed?.scripts ?? parsed?.data ?? parsed?.result
      if (Array.isArray(arr)) {
        const results = arr
          .flatMap((item) => {
            if (typeof item === "string") return [item]
            if (item && typeof item === "object") {
              const record = item as Record<string, unknown>
              const value =
                typeof record.content === "string"
                  ? record.content
                  : typeof record.script === "string"
                    ? record.script
                    : typeof record.text === "string"
                      ? record.text
                      : null
              return value ? [value] : []
            }
            return []
          })
          .map((item) => item.trim())
          .filter(Boolean)
          .slice(0, 3)
        if (results.length > 0) return results
      }
    } catch {
      // Try next strategy
    }
  }

  return content
    .split("\n")
    .map((line) => line.replace(/^\d+[\.\)]\s*/, "").trim())
    .filter((line) => line.length > 20 && !line.startsWith("```") && !line.startsWith("[") && !line.startsWith("{"))
    .slice(0, 3)
}

/**
 * @description 解析scriptdirections
 * @param content - 内容
 * @returns ScriptDirection[]
 */
export function parseScriptDirections(content: string): ScriptDirection[] {
  const attempts = [
    content.trim(),
    content.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim(),
    // Extract JSON object from content that may have surrounding text
    (() => {
      const s = content.indexOf("{"), e = content.lastIndexOf("}")
      return s !== -1 && e > s ? content.slice(s, e + 1) : ""
    })(),
  ]

  for (const raw of attempts) {
    if (!raw) continue
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      // Try multiple key names the model might use
      const directions = Array.isArray(parsed?.directions)
        ? parsed.directions
        : Array.isArray(parsed?.data)
          ? parsed.data
          : Array.isArray(parsed?.results)
            ? parsed.results
            : Array.isArray(parsed?.items)
              ? parsed.items
              : []
      const validDirections = directions.flatMap((item) => {
        if (!item || typeof item !== "object") return []
        const record = item as Record<string, unknown>
        const direction: ScriptDirection = {
          openingStrategy: asNonEmptyString(record.openingStrategy) || asNonEmptyString(record.opening_strategy) || asNonEmptyString(record.opening),
          narrativeStyle: asNonEmptyString(record.narrativeStyle) || asNonEmptyString(record.narrative_style) || asNonEmptyString(record.narrative),
          coreArgument: asNonEmptyString(record.coreArgument) || asNonEmptyString(record.core_argument) || asNonEmptyString(record.argument),
          endingRequirement: asNonEmptyString(record.endingRequirement) || asNonEmptyString(record.ending_requirement) || asNonEmptyString(record.ending),
        }

        return isValidDirection(direction) ? [direction] : []
      })

      if (validDirections.length >= 3) {
        return validDirections.slice(0, 3)
      }
    } catch {
      // try next format
    }
  }

  return []
}

/**
 * @description sanitizescriptcandidates
 * @param candidates - candidates
 * @returns string[]
 */
export function sanitizeScriptCandidates(candidates: string[]): string[] {
  const unique = new Set<string>()
  const sanitized: string[] = []

  for (const raw of candidates) {
    const cleaned = cleanScriptContent(raw)
    if (!isValidScriptCandidate(cleaned)) {
      continue
    }
    if (unique.has(cleaned)) {
      continue
    }
    unique.add(cleaned)
    sanitized.push(cleaned)
  }

  return sanitized
}

/** Strip structural/meta notes that LLMs sometimes prepend to scripts. */
function cleanScriptContent(script: string): string {
  return script
    .replace(/^本条文案采用[^。]*。\s*/g, "")
    .replace(/^整体表达口吻[^。]*。\s*/g, "")
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/^文案\d+[:：]\s*/g, "")
    .trim()
}

function isValidDirection(direction: ScriptDirection): boolean {
  return [
    direction.openingStrategy,
    direction.narrativeStyle,
    direction.coreArgument,
    direction.endingRequirement,
  ].every((field) => field.length >= 6)
}

function isValidScriptCandidate(candidate: string): boolean {
  if (candidate.length < 60) {
    return false
  }

  const invalidPatterns = [
    /^["']?error["']?\s*:/i,
    /^错误[:：]/,
    /^抱歉/,
    /^无法/,
    /^请补充/,
    /信息不完整/,
    /仅看到/,
    /输出3条JSON/,
    /JSON数组/,
    /请按要求/,
  ]

  return !invalidPatterns.some((pattern) => pattern.test(candidate))
}

function asNonEmptyString(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}
