import { applyFirstMatchingStructureToReference } from "@/lib/aim-editor"
import { extractBenchmarkAnalysisText } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

/**
 * Collect analysis text candidates from source, input, and conversation history.
 */
/**
 * @description 收集analysistextcandidates
 * @param input - 输入数据
 * @param messages - 消息列表
 * @param sourceAnalysisText - 来源分析文本
 * @returns string[]
 */
export function collectAnalysisTextCandidates(input: string, messages: AimWorkbenchMessage[], sourceAnalysisText: string): string[] {
  const candidates: string[] = []
  if (sourceAnalysisText.trim()) candidates.push(sourceAnalysisText)
  const inputAnalysis = extractBenchmarkAnalysisText(input)
  if (inputAnalysis) candidates.push(inputAnalysis)
  for (const message of [...messages].reverse()) {
    if (message.role !== "user") continue
    const messageAnalysis = extractBenchmarkAnalysisText(message.content)
    if (messageAnalysis) candidates.push(messageAnalysis)
  }
  return candidates
}

/**
 * Annotate reference text with structural markup from analysis candidates.
 */
/**
 * @description 构建annotatedreferencetext
 * @param sourceOriginalText - 来源原始值文本
 * @param analysisTextCandidates - 分析文本Candidates
 * @returns string
 */
export function buildAnnotatedReferenceText(
  sourceOriginalText: string,
  analysisTextCandidates: string[],
): string {
  return applyFirstMatchingStructureToReference(sourceOriginalText, analysisTextCandidates)
}
