import type { ContentFormat } from "@/lib/aim-generator"
import { runQualityCheck } from "@/lib/quality-gate"

import { deriveQualityStatus, validateFormat } from "./validators"
import type { FormatValidationResult } from "./validators"

const MAIN_DRAFT_FORMATS = new Set<ContentFormat>([
  "video_script",
  "koubo_script",
  "xiaohongshu_post",
])

export interface AimGenerationLike {
  results: Array<{ format: ContentFormat; content: string }>
}

export interface AimQualityAssessment {
  qualityChecks: FormatValidationResult[]
  qualityStatus: "pass" | "warn" | "fail" | "skipped"
  qualityReport?: Record<string, unknown>
}

export function isAimGenerationLike(value: unknown): value is AimGenerationLike {
  if (!value || typeof value !== "object") return false
  const results = (value as { results?: unknown }).results
  return Array.isArray(results) && results.every((item) => {
    if (!item || typeof item !== "object") return false
    const record = item as { format?: unknown; content?: unknown }
    return typeof record.format === "string" && typeof record.content === "string"
  })
}

/**
 * AIM 生成质量评估的唯一实现。评估只读，不自动改写交付物。
 */
export async function assessAimGeneration(input: {
  output: AimGenerationLike
  agentId: string
  taskType?: string
  runLlmQuality?: boolean
}): Promise<AimQualityAssessment> {
  const qualityChecks = input.output.results.map((item, index) =>
    validateFormat({
      format: item.format,
      content: item.content,
      minChars: 20,
      isMainDraft: index === 0 && MAIN_DRAFT_FORMATS.has(item.format),
    }),
  )

  let qualityReport: Record<string, unknown> | undefined
  let llmOverallPassed: boolean | undefined
  let llmRan = false

  if (input.runLlmQuality !== false) {
    const mainDraft = input.output.results.find(
      (item) => item.content.trim() && MAIN_DRAFT_FORMATS.has(item.format),
    )
    const skipLlm =
      input.agentId === "persona"
      || input.agentId === "free_copywriter"
      || input.taskType === "polish_copy"
      || input.taskType === "quality_check"

    if (mainDraft && !skipLlm) {
      try {
        const report = await runQualityCheck({
          content: mainDraft.content,
          topicTitle: undefined,
        })
        llmRan = true
        llmOverallPassed = report.overall.passed
        qualityReport = {
          overallScore: report.overall.score,
          passed: report.overall.passed,
          editorial: report.editorial.score,
          aiTaste: report.aiTaste.score,
          attraction: report.attraction.score,
          logic: report.logic.score,
          compliance: report.compliance
            ? {
                passed: report.compliance.passed,
                violations: report.compliance.violations.length,
              }
            : undefined,
        }
      } catch (error) {
        console.warn("[aim-harness] quality check failed:", error)
      }
    }
  }

  return {
    qualityChecks,
    qualityStatus: deriveQualityStatus({
      deterministic: qualityChecks,
      llmOverallPassed,
      llmRan,
    }),
    qualityReport,
  }
}
