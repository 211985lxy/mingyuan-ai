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

// ─── Prompt 模板 ─────────────────────────────────────────

const COMBINED_EVALUATION_PROMPT = `你是一位顶级的新媒体运营与短视频内容质量评估专家。请针对以下短视频文案进行全方位的打分评估。

【IP 人设信息】
{persona}

【选题与结构要求】
- 选题标题：{topicTitle}
- 开头类型：{openingType}
- 文案结构：{structure}
- 结尾类型：{endingType}

【文案内容】
---
{content}
---

评估维度与评分标准：
1. editorial (编辑质量，及格线 7 分，满分 10 分)：
   - 结构完整性（开头-主体-结尾是否完整）
   - 可读性（语言是否流畅、易读、适合口播）
   - 人设匹配度（语气风格是否符合人设）

2. attraction (吸引力，及格线 7 分，满分 10 分)：
   - 开头钩子强度（前3秒能否抓人，是否契合开头类型）
   - 悬念设置（是否让用户想继续看）
   - 用户留存预判（完播率预估）

3. logic (逻辑一致性，及格线 7 分，满分 10 分)：
   - 文案是否紧密围绕选题展开，论点与论据是否匹配
   - 文案结构与所选结构类型是否吻合

请输出 JSON 格式（不要包含任何 markdown 代码块标记，不要多余解释）：
{
  "editorial": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  },
  "attraction": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  },
  "logic": {
    "score": <1-10>,
    "feedback": "<一句话改进建议>",
    "details": "<详细分析>"
  }
}`

const REWRITE_PROMPT = `你是一位资深短视频文案专家。以下文案未通过质量门控，请根据反馈重写。

原始文案：
---
{content}
---

质量反馈：
- 编辑质量: {editorialScore}/10 — {editorialFeedback}
- AI 味: {aiTasteScore}/10 — {aiTasteFeedback}
- 吸引力: {attractionScore}/10 — {attractionFeedback}
- 逻辑一致: {logicScore}/10 — {logicFeedback}

IP 人设：{persona}
选题：{topicTitle}
开头类型：{openingType}
文案结构：{structure}
结尾类型：{endingType}

重写要求：
1. 保持 100-250 字（短视频口播）
2. 前 3 秒必须有强力钩子
3. 口语化、有节奏感、无 AI 味
4. 紧密围绕选题展开
5. 不要使用禁词和排比句式
6. 直接输出文案正文，不要任何解释`

const HOOK_REWRITE_PROMPT = `你是一位顶级短视频文案专家。当前文案在开头前3秒的吸引力上得分过低，请对其进行【靶向开头重构】。

【选题标题】：{topicTitle}
【要求的开头类型】：{openingType}
【吸引力缺陷反馈】：{attractionFeedback}
【IP 设定信息】：{persona}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 仅针对原始文案的【前3秒钩子（开头句，通常为前 30-50 字）】进行强力重构，使其能够瞬间抓住用户眼球、引发强烈好奇心或产生共鸣，完美吻合指定的开头类型。
2. 必须保持文案的中段叙事逻辑、主体讨论、事实证据和结尾的行动号召（CTA）100% 不变，不能修改、删减或添加多余内容！
3. 最终输出重构融合后的完整文案，要求开头与主体段落过渡平滑、自然流畅。
4. 直接输出重构融合后的完整文案正文，不要包含任何旁白、解释、括号说明，不要带 markdown 标记。`

const ORAL_REWRITE_PROMPT = `你是一位顶级短视频内容编辑器。当前文案被检测出 AI 写作痕迹过重，书面词与套路过多，请进行【靶向口语去油精修】。

【命中的 AI 特征】：{aiTasteHits}
【口语化改进建议】：{aiTasteFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 仔细阅读原始文案，识别并彻底剔除其中所有生硬、书面官腔、或套路化的 AI 词汇（如：赋能、痛点、赛道、底层逻辑、闭环、矩阵等）及生硬排比。
2. 必须保持文案的原意、核心事实、论点以及整体叙事逻辑段落结构 100% 不变。
3. 将生硬的文章式过渡（如“首先...其次...最后...”）替换为极其自然的口头语气衔接，长句拆为轻松、有节奏感的短句，增加口播真实感。
4. 直接输出去油精修后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

const LOGIC_REWRITE_PROMPT = `你是一位严格的短视频内容逻辑总监。当前文案中段论述与选题或叙事蓝图契合度较低，论证不够严密，请进行【靶向逻辑链重构】。

【选题标题】：{topicTitle}
【期望的叙事结构】：{structure}
【逻辑缺陷反馈】：{logicFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 必须保留原本优秀的开头前3秒钩子与结尾 CTA 引导，切勿修改它们。
2. 仅针对中段的主体论述，调整论点与论据的承接关系，优化中段逻辑结构，使其紧密围绕选题，完美吻合期望的视频叙事节拍。
3. 确保文案前后的逻辑链连贯，没有偏离主题或自相矛盾的地方，逻辑环环相扣。
4. 直接输出融合重构后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

const EDITORIAL_REWRITE_PROMPT = `你是一位顶级短视频新媒体运营总监。当前文案的编辑质量（语气人设、句式流畅度）不足，请进行【靶向编辑质量精修】。

【期望的 IP 人设与语气】：{persona}
【编辑缺陷反馈】：{editorialFeedback}

【原始完整文案】：
---
{content}
---

【任务要求】：
1. 调整整篇文案的用词语气，使其 100% 契合期望的 IP 人设口吻，做到自然、温和或有力量，适合口播。
2. 修复文案中结构松散或口播不够连贯流畅的地方，理顺语气过渡，使其朗朗上口。
3. 保持原有的核心事实与论点不变。
4. 直接输出精修后的完整文案正文，不要包含任何多余的解释，不要带 markdown 标记。`

// ─── 辅助与解析 ──────────────────────────────────────────

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (_, key) => vars[key] || "")
}

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
    return fillTemplate(ORAL_REWRITE_PROMPT, {
      content,
      aiTasteHits: report.aiTaste.details || "未指定",
      aiTasteFeedback: report.aiTaste.feedback,
    })
  }
  if (targetFocus === "attraction") {
    return fillTemplate(HOOK_REWRITE_PROMPT, {
      content,
      topicTitle: input.topicTitle || "未指定",
      openingType: input.openingType || "未指定",
      attractionFeedback: report.attraction.feedback,
      persona,
    })
  }
  if (targetFocus === "logic") {
    return fillTemplate(LOGIC_REWRITE_PROMPT, {
      content,
      topicTitle: input.topicTitle || "未指定",
      structure: input.structure || "未指定",
      logicFeedback: report.logic.feedback,
    })
  }
  if (targetFocus === "editorial") {
    return fillTemplate(EDITORIAL_REWRITE_PROMPT, {
      content,
      persona,
      editorialFeedback: report.editorial.feedback,
    })
  }
  return fillTemplate(REWRITE_PROMPT, { content })
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
        { role: "system", content: "你是一个专业的新媒体内容质量评估专家。只输出纯 JSON，不要 Markdown 代码块标记。" },
        { role: "user", content: fillTemplate(COMBINED_EVALUATION_PROMPT, vars) },
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
    const rewriteMaxTokens = currentContent.length >= 1000 ? 4000 : 800

    const rewriteResult = await llm.complete({
      messages: [
        { role: "system", content: "你是一位精益求精的短视频文案靶向编辑器。直接输出改写融合后的完整文案正文，不要任何解释。" },
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
