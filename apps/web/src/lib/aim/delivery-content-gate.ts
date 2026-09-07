import type { ContentFormat } from "@/lib/aim-generator"
import type { ResolvedUserIntent } from "@/lib/aim/resolved-user-intent"
import { inspectAimDeliveryCandidate } from "@/lib/aim/output-delivery-gate"
import {
  detectSpokenChainOfThoughtLeakage,
  extractSpokenFinalDraft,
  scrubPromptLeakageFromBody,
  withoutMethodNote,
} from "@/lib/aim-generation-text"

export type AimDeliveryViolation =
  | "reasoning_leak"
  | "prompt_leak"
  | "invented_length"
  | "missing_final_content"

export class AimDeliveryContentError extends Error {
  readonly code = "DELIVERY_REASONING_LEAK"
  readonly violations: AimDeliveryViolation[]

  constructor(violations: AimDeliveryViolation[]) {
    super("生成结果没有满足你当前的要求，未作为正式成稿交付。")
    this.name = "AimDeliveryContentError"
    this.violations = violations
  }
}

const INVENTED_LENGTH_LINE = /^(?:\d+[\.．、]\s*)?(?:这是一份)?(?:口播脚本|短视频脚本|文案).{0,40}(?:分钟|\d+\s*[-–~]\s*\d+\s*字)/
const PROMPT_LEAK_LINE = /(?:注意避免禁用词|禁止使用以下词汇|AIM_INTERNAL_|\[\[SYSTEM|把方法论说明书腔)/

function fallbackIntent(): ResolvedUserIntent {
  return {
    taskKind: "new_draft",
    taskObject: "",
    lengthPolicy: "unset",
    isNewTask: true,
    constraintSources: {},
  }
}

export function inspectDeliveryContent(input: {
  format: ContentFormat
  content: string
  intent: ResolvedUserIntent
}): { passed: true } | {
  passed: false
  violations: AimDeliveryViolation[]
  leakedLines: string[]
} {
  const body = scrubPromptLeakageFromBody(withoutMethodNote(input.content)).trim()
  const leakedLines: string[] = []
  const violations = new Set<AimDeliveryViolation>()
  if (!body) violations.add("missing_final_content")

  const cotHits = detectSpokenChainOfThoughtLeakage(input.content)
  if (cotHits.length) {
    violations.add("reasoning_leak")
    leakedLines.push(...cotHits)
  }

  const protocol = inspectAimDeliveryCandidate({ contents: { [input.format]: body } })
  if (!protocol.passed) {
    if (protocol.code === "empty_final_content") violations.add("missing_final_content")
    else violations.add("prompt_leak")
  }

  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed) continue
    if (PROMPT_LEAK_LINE.test(trimmed)) {
      violations.add("prompt_leak")
      leakedLines.push(trimmed)
    }
    if (input.intent.lengthPolicy === "unset" && INVENTED_LENGTH_LINE.test(trimmed)) {
      violations.add("invented_length")
      leakedLines.push(trimmed)
    }
  }

  if (violations.size === 0) return { passed: true }
  return { passed: false, violations: [...violations], leakedLines }
}

export function applyDeliveryContentGate(input: {
  parsed: Partial<Record<ContentFormat, string>>
  targetFormats: ContentFormat[]
  intent?: ResolvedUserIntent
  attempt: number
  maxAttempts: number
  originalPrompt: string
}): { ok: true } | { ok: false; retryPrompt: string } {
  const intent = input.intent ?? fallbackIntent()
  const failed: Array<{ format: ContentFormat; violations: AimDeliveryViolation[]; leakedLines: string[] }> = []
  for (const format of input.targetFormats) {
    const result = inspectDeliveryContent({
      format,
      content: input.parsed[format] || "",
      intent,
    })
    if (!result.passed) failed.push({ format, violations: result.violations, leakedLines: result.leakedLines })
  }
  if (failed.length === 0) return { ok: true }

  const lastAttempt = input.attempt >= input.maxAttempts - 1
  if (lastAttempt) {
    for (const item of failed) {
      const extraction = extractSpokenFinalDraft(input.parsed[item.format] || "")
      const recheck = inspectDeliveryContent({ format: item.format, content: extraction.draft, intent })
      if (!recheck.passed || withoutMethodNote(extraction.draft).trim().length < 80) {
        throw new AimDeliveryContentError(item.violations)
      }
      input.parsed[item.format] = extraction.draft
    }
    return { ok: true }
  }

  const samples = failed.flatMap((item) => item.leakedLines).slice(0, 6)
  const labels = [...new Set(failed.flatMap((item) => item.violations))].join("、")
  return {
    ok: false,
    retryPrompt: `${input.originalPrompt}

上一版交付闸门未通过（${labels}）。正文从第一句起必须是可直接使用的成稿；任务分析、系统提示、自检和格式说明不得进入正文。
${samples.length ? `例如不得出现：\n${samples.map((s) => `- ${s}`).join("\n")}` : ""}`,
  }
}
