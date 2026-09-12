/**
 * 四维质量门控引擎
 *
 * PRD 模块 4.1 — 文案生成后自动执行四维度检测：
 * 1. 编辑质量（结构完整度、可读性、人设匹配）
 * 2. AI 味检测（93 个禁词黑名单 + 句式评分）
 * 3. 吸引力（开头钩子强度、悬念设置、用户留存预判）
 * 4. 逻辑一致（选题与文案一致性、论点与论据匹配）
 *
 * 不及格时触发 AI 自动重写（最多 3 次）。
 */

import { LLMClient } from "./llm/client"
import { detectAITaste } from "./ai-taste-detector"
import { promptRegistry } from "./prompt/registry"
import { fillPromptTemplate } from "./prompt/template"
import { PROMPT_KEYS } from "./prompt/types"
import {
  checkRedFoxSensitiveWords,
  type ComplianceResult,
  type CompliancePlatform,
} from "./redfox/wordcheck"

// ─── 类型定义 ─────────────────────────────────────────────

export interface QualityDimensionResult {
  score: number       // 1-10
  passed: boolean     // 是否及格
  feedback: string    // 改进建议
  details?: string    // 详细分析
}

export interface QualityReport {
  editorial: QualityDimensionResult
  aiTaste: QualityDimensionResult
  attraction: QualityDimensionResult
  logic: QualityDimensionResult
  compliance?: ComplianceResult  // 平台合规检测结果（第5维，可选）
  overall: {
    score: number
    passed: boolean
    needsRewrite: boolean
  }
  rewriteCount: number
}

export interface QualityCheckInput {
  content: string
  topicTitle?: string
  openingType?: string
  structure?: string
  endingType?: string
  publishPlatform?: CompliancePlatform  // 目标发布平台（用于违禁词检测）
  persona?: {
    roleType?: string
    oneLiner?: string
    toneOfVoice?: string
  }
}

// ─── 及格线 ──────────────────────────────────────────────

const PASS_SCORES = {
  editorial: 7,
  aiTaste: 6,
  attraction: 7,
  logic: 7,
} as const

const MAX_REWRITE_ATTEMPTS = 3

// ─── Prompt 模板（批1 起迁入 prompt registry，见 src/lib/prompt/seeds-quality-gate.ts） ──

// ─── 辅助与解析 ──────────────────────────────────────────

interface EvaluationFields {
  score: number
  feedback: string
  details: string
}

interface CombinedEvaluationResult {
  editorial: EvaluationFields
  attraction: EvaluationFields
  logic: EvaluationFields
}

function parseCombinedEvaluation(raw: string): CombinedEvaluationResult {
  const defaultFields = (feedback: string) => ({
    score: 5,
    feedback,
    details: "",
  })

  const fallbackResult: CombinedEvaluationResult = {
    editorial: defaultFields("评分解析失败"),
    attraction: defaultFields("评分解析失败"),
    logic: defaultFields("评分解析失败"),
  }

  if (!raw) return fallbackResult

  try {
    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      
      const cleanDimension = (obj: Record<string, unknown> | null | undefined, passVal: number): EvaluationFields => {
        return {
          score: Math.max(1, Math.min(10, Number(obj?.score) || passVal)),
          feedback: typeof obj?.feedback === "string" ? obj.feedback : "",
          details: typeof obj?.details === "string" ? obj.details : "",
        }
      }

      return {
        editorial: cleanDimension(parsed?.editorial, 5),
        attraction: cleanDimension(parsed?.attraction, 5),
        logic: cleanDimension(parsed?.logic, 5),
      }
    }
  } catch (e) {
    console.warn("[quality-gate] Failed to parse combined evaluation JSON:", e)
  }

  return fallbackResult
}

function formatPersona(persona: QualityCheckInput["persona"]): string {
  return persona
    ? `${persona.roleType || ""}，${persona.oneLiner || ""}，语气：${persona.toneOfVoice || ""}`
    : "未指定"
}

function toQualityDimension(fields: EvaluationFields, passScore: number): QualityDimensionResult {
  return {
    score: fields.score,
    passed: fields.score >= passScore,
    feedback: fields.feedback,
    details: fields.details,
  }
}

async function checkPublishCompliance(input: QualityCheckInput): Promise<ComplianceResult | undefined> {
  if (!input.publishPlatform || !input.content.trim()) return undefined
  try {
    return await checkRedFoxSensitiveWords({
      content: input.content,
      platform: input.publishPlatform,
    })
  } catch (error) {
    console.warn("[quality-gate] Compliance check failed:", error)
    return undefined
  }
}

function buildTargetedRewritePrompt(
  input: QualityCheckInput,
  content: string,
  report: QualityReport,
): string {
  const gaps = [
    { dimension: "aiTaste", gap: report.aiTaste.passed ? 0 : PASS_SCORES.aiTaste - report.aiTaste.score, priority: 4 },
    { dimension: "attraction", gap: report.attraction.passed ? 0 : PASS_SCORES.attraction - report.attraction.score, priority: 3 },
    { dimension: "logic", gap: report.logic.passed ? 0 : PASS_SCORES.logic - report.logic.score, priority: 2 },
    { dimension: "editorial", gap: report.editorial.passed ? 0 : PASS_SCORES.editorial - report.editorial.score, priority: 1 },
  ]
  gaps.sort((a, b) => b.gap !== a.gap ? b.gap - a.gap : b.priority - a.priority)

  const targetFocus = gaps[0].dimension
  const persona = formatPersona(input.persona)
  if (targetFocus === "aiTaste") {
    return fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateOralRewrite).content, {
      content,
      aiTasteHits: report.aiTaste.details || "未指定",
      aiTasteFeedback: report.aiTaste.feedback,
    })
  }
  if (targetFocus === "attraction") {
    return fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateHookRewrite).content, {
      content,
      topicTitle: input.topicTitle || "未指定",
      openingType: input.openingType || "未指定",
      attractionFeedback: report.attraction.feedback,
      persona,
    })
  }
  if (targetFocus === "logic") {
    return fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateLogicRewrite).content, {
      content,
      topicTitle: input.topicTitle || "未指定",
      structure: input.structure || "未指定",
      logicFeedback: report.logic.feedback,
    })
  }
  if (targetFocus === "editorial") {
    return fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateEditorialRewrite).content, {
      content,
      persona,
      editorialFeedback: report.editorial.feedback,
    })
  }
  return fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateRewrite).content, { content })
}

// ─── 核心 ────────────────────────────────────────────────

/**
 * @description 执行四维质量检查（编辑质量、AI味检测、吸引力、逻辑一致），可选进行平台合规检测
 * @param input - 质量检查输入（包含文案内容、选题、结构、人设等信息）
 * @returns 四维质量报告，包含各维度得分、是否通过及综合结果
 */
export async function runQualityCheck(input: QualityCheckInput): Promise<QualityReport> {
  const llm = LLMClient.shared()

  const vars = {
    content: input.content,
    topicTitle: input.topicTitle || "未指定",
    openingType: input.openingType || "未指定",
    structure: input.structure || "未指定",
    endingType: input.endingType || "未指定",
    persona: formatPersona(input.persona),
  }

  const aiTasteResult = detectAITaste(input.content)

  let combinedRaw = ""
  try {
    const response = await llm.complete({
      messages: [
        { role: "system", content: promptRegistry.get(PROMPT_KEYS.qualityGateEvaluationSystem).content },
        { role: "user", content: fillPromptTemplate(promptRegistry.get(PROMPT_KEYS.qualityGateEvaluation).content, vars) },
      ],
      temperature: 0.2, // 保持低随机度以增强 JSON 返回的稳定性
      maxTokens: 1000,
    })
    combinedRaw = response.content
  } catch (error) {
    console.error("[quality-gate] Combined LLM evaluation failed:", error)
  }

  const parsed = parseCombinedEvaluation(combinedRaw)

  const editorial = toQualityDimension(parsed.editorial, PASS_SCORES.editorial)

  const aiTaste: QualityDimensionResult = {
    score: aiTasteResult.score,
    passed: aiTasteResult.score >= PASS_SCORES.aiTaste,
    feedback: aiTasteResult.suggestions.join("；"),
    details: `禁词命中: ${aiTasteResult.forbiddenWordHits.length} 个，句式命中: ${aiTasteResult.patternHits.length} 个`,
  }

  const attraction = toQualityDimension(parsed.attraction, PASS_SCORES.attraction)
  const logic = toQualityDimension(parsed.logic, PASS_SCORES.logic)

  const allPassed = editorial.passed && aiTaste.passed && attraction.passed && logic.passed
  const avgScore = (editorial.score + aiTaste.score + attraction.score + logic.score) / 4

  const compliance = await checkPublishCompliance(input)

  return {
    editorial,
    aiTaste,
    attraction,
    logic,
    compliance,
    overall: {
      score: Math.round(avgScore * 10) / 10,
      passed: allPassed,
      needsRewrite: !allPassed,
    },
    rewriteCount: 0,
  }
}

/**
 * @description 执行质量门控并在未通过时自动触发 AI 靶向重写（最多 3 次）
 * @param input - 质量检查输入（包含文案内容、选题、结构、人设等信息）
 * @param onRewrite - 每次重写时的回调函数，接收重写次数和当前报告
 * @returns 最终文案内容及对应的质量报告
 */
export async function runQualityGateWithRewrite(
  input: QualityCheckInput,
  onRewrite?: (attempt: number, report: QualityReport) => void
): Promise<{ content: string; report: QualityReport }> {
  let currentContent = input.content
  let report = await runQualityCheck({ ...input, content: currentContent })
  let rewriteCount = 0

  while (!report.overall.passed && rewriteCount < MAX_REWRITE_ATTEMPTS) {
    rewriteCount++
    report.rewriteCount = rewriteCount

    if (onRewrite) onRewrite(rewriteCount, report)

    const llm = LLMClient.shared()
    const rewritePrompt = buildTargetedRewritePrompt(input, currentContent, report)

    // 长文案（>=1000字）需要更多 token 避免截断，短文案保持 800
    const rewriteMaxTokens = currentContent.length >= 1000 ? 8192 : 800

    const rewriteResult = await llm.complete({
      messages: [
        { role: "system", content: promptRegistry.get(PROMPT_KEYS.qualityGateRewriteSystem).content },
        { role: "user", content: rewritePrompt },
      ],
      temperature: 0.7,
      maxTokens: rewriteMaxTokens,
    })

    currentContent = rewriteResult.content.trim()
    report = await runQualityCheck({ ...input, content: currentContent })
    report.rewriteCount = rewriteCount
  }

  return { content: currentContent, report }
}
