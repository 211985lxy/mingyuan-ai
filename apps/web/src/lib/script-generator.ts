import { renderTemplate } from "@/lib/template-engine"
import { LLMClient } from "@/lib/llm"
import { buildHotTopicPromptSection } from "@/lib/hot-topic-intelligence"
import type { ContentTemplate } from "@/generated/prisma/client"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import type { ExpressionBlueprint, TemplateVariable } from "@/types/content-template"

// ─── Model configuration ──────────────────────────────────
// Meta-prompt generation & scoring: Sonnet 4.6 (analytical, structured)
// Script creation: GPT-5.4 (creative, fluent Chinese)
const META_MODEL = process.env.META_PROMPT_MODEL || "anthropic/claude-sonnet-4.6"
const SCRIPT_MODEL = process.env.SCRIPT_GENERATION_MODEL || "openai/gpt-5.4"
const SCORE_MODEL = process.env.SCORE_MODEL || "anthropic/claude-sonnet-4.6"

// Per-step timeout: prevents one slow step from consuming the entire 120s budget
const STEP_TIMEOUT_MS = 30_000 // 30s per LLM call

export interface StructureBlueprint {
  openingPattern: string
  narrativeBeats: string[]
  evidenceSlots: number
  ctaSlot: string
  durationRange: { min: number; max: number }
  pace?: "fast" | "medium" | "slow"
  evidenceDensity?: "low" | "medium" | "high"
  ctaStyle?: "soft" | "direct" | "hard"
  packagingIntent?: {
    subtitleStyle: "minimal" | "standard" | "highlight" | "chapter"
    visualPriority: "talking_head" | "balanced" | "visual_first"
    preferredTemplateCapabilities: string[]
    requiredTemplateCapabilities?: string[]
    recommendedMaterialRoles: string[]
    bgmGuidance: string
    defaultPackRules?: Record<string, unknown> | null
    defaultProcessRules?: Record<string, unknown> | null
  } | null
}

interface ScriptDirection {
  openingStrategy: string
  narrativeStyle: string
  coreArgument: string
  endingRequirement: string
}

// ─── Topic context from Phase 13 topic selection ──────────
export interface TopicContext {
  topicSelectionId: string
  topicTitle: string
  elementTags: string[]         // e.g. ["curiosity", "trust"]
  openingTypeCode: string       // e.g. "curiosity_open"
  openingTypeName: string
  openingFormulas: string[]     // formula templates from OpeningType.formulas
  copyStructureCode: string     // e.g. "three_beat_ramp"
  copyStructureName: string
  copyStructureBeats: Array<{ label: string; instruction: string }>
  endingTypeCode: string        // e.g. "interactive"
  endingTypeName: string
  endingGuidance: string
  endingPatterns: string[]
}

// ─── Hot topic fusion context for COPY-04 ─────────────────
export interface HotTopicFusionContext {
  hotTopicTitle: string
  talkingPoints: string[]
}

interface GenerateScriptCandidatesParams {
  template: Pick<
    ContentTemplate,
    "id" | "displayName" | "description" | "scriptTemplate" | "hookType"
  > & {
    variables: TemplateVariable[]
    expressionBlueprint?: ExpressionBlueprint | null
  }
  inputs: Record<string, string>
  hotTopicContext?: {
    topicId: string
    title: string
    insight: ApiHotTopicInsight
    fit: ApiHotTopicFit
  } | null
  ipProfile?: {
    displayName?: string | null
    nickname?: string | null
    industry?: string | null
    primaryOffer?: string | null
    targetAudience?: string | null
    ipTraits?: string | null
    toneOfVoice?: string | null
    proofPoints?: string | null
    callToAction?: string | null
    promptSnapshot?: string | null
    profileVersion?: number | null
    business?: unknown | null
    persona?: unknown | null
    content?: unknown | null
  } | null
  structure?: {
    displayName: string
    blueprint: StructureBlueprint
  }
  // Phase 14: topic engine context (optional for backward compatibility)
  topicContext?: TopicContext | null
  // Phase 14: hot topic fusion (COPY-04)
  hotTopicFusion?: HotTopicFusionContext | null
  // IP 写作风格档案（用户级全局，由调用方从知识库读取后注入）
  styleProfileBlock?: string | null
}

export interface CandidateScore {
  overall: number // 0-100
  structuralCompliance: number
  viewpointClarity: number
  evidenceStrength: number
  ctaClarity: number
  voiceFit: number
  lengthInRange: boolean
  // Phase 14: new scoring dimensions (COPY-05)
  openingFormulaCompliance: number
  endingTypeCompliance: number
}

export interface ScriptGenerationResult {
  candidates: string[]
  scores: CandidateScore[]
  promptText: string
  model: string
  isDegraded: boolean // true if best candidate score < 60
  // Phase 14: hot-topic fusion results (COPY-04)
  hotTopicCandidates?: string[]
  hotTopicScores?: CandidateScore[]
}

const DEFAULT_MODEL = "rule-based-fallback"

// ─── Main pipeline (with COPY-04 parallel generation) ──────

export async function generateScriptCandidates(
  params: GenerateScriptCandidatesParams
): Promise<ScriptGenerationResult> {
  const llm = LLMClient.shared()

  if (!llm.available) {
    return fallbackResult(params)
  }

  const contextBlock = buildContextBlock(params)

  // COPY-04: If hot topic fusion is requested, run original + hot-topic in parallel
  if (params.hotTopicFusion) {
    return generateWithHotTopicFusion(llm, contextBlock, params)
  }

  try {
    // Step 1: Meta-prompt generation (Sonnet 4.6) — 30s timeout
    const metaPrompt = await withTimeout(
      generateMetaPrompt(llm, contextBlock, params),
      STEP_TIMEOUT_MS,
      "meta-prompt",
    )

    // Step 2: Script creation (GPT-5.4) — 30s timeout
    const candidates = await withTimeout(
      generateScriptsWithPrompt(llm, metaPrompt),
      STEP_TIMEOUT_MS,
      "script-generation",
    )

    // Step 3: AI scoring (Sonnet 4.6) — 30s timeout
    const scores = await withTimeout(
      scoreWithAI(llm, candidates, params),
      STEP_TIMEOUT_MS,
      "scoring",
    )
    return buildGenerationResult(candidates, scores, metaPrompt, SCRIPT_MODEL)
  } catch (error) {
    console.warn("[script-generator] Structured pipeline failed, trying direct recovery:", error instanceof Error ? error.message : error)

    try {
      const recovered = await withTimeout(
        generateScriptsDirectly(llm, contextBlock, params),
        STEP_TIMEOUT_MS * 2,
        "direct-recovery",
      )
      const scores = await withTimeout(
        scoreWithAI(llm, recovered.candidates, params),
        STEP_TIMEOUT_MS,
        "scoring-recovery",
      )
      return buildGenerationResult(
        recovered.candidates,
        scores,
        recovered.promptText,
        `${SCRIPT_MODEL}:direct-recovery`,
      )
    } catch (recoveryError) {
      console.warn("[script-generator] Direct recovery failed, falling back:", recoveryError instanceof Error ? recoveryError.message : recoveryError)
      return fallbackResult(params)
    }
  }
}

// ─── COPY-04: Hot-topic fusion dual-version parallel generation ──

async function generateWithHotTopicFusion(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<ScriptGenerationResult> {
  const fusion = params.hotTopicFusion!
  const hotTopicContextBlock = buildHotTopicFusionContextBlock(contextBlock, fusion)

  const startTime = Date.now()
  console.log("[script-generator] COPY-04: Starting parallel original + hot-topic generation")

  // Run both in parallel via Promise.all (target 5-7s total)
  const [originalResult, hotTopicResult] = await Promise.all([
    generateSingleBatch(llm, contextBlock, params),
    generateSingleBatch(llm, hotTopicContextBlock, params),
  ])

  const duration = Date.now() - startTime
  console.log(`[script-generator] COPY-04: Parallel generation completed in ${duration}ms`)

  // Score both batches in parallel
  const [originalScores, hotTopicScores] = await Promise.all([
    scoreWithAI(llm, originalResult.candidates, params),
    scoreWithAI(llm, hotTopicResult.candidates, params),
  ])

  const baseResult = buildGenerationResult(
    originalResult.candidates,
    originalScores,
    originalResult.promptText,
    SCRIPT_MODEL,
  )

  // Attach hot-topic results
  const hotTopicSorted = hotTopicResult.candidates
    .map((c, i) => ({ candidate: c, score: hotTopicScores[i] }))
    .sort((a, b) => b.score.overall - a.score.overall)

  baseResult.hotTopicCandidates = hotTopicSorted.map((item) => item.candidate)
  baseResult.hotTopicScores = hotTopicSorted.map((item) => item.score)

  return baseResult
}

function buildHotTopicFusionContextBlock(
  baseContextBlock: string,
  fusion: HotTopicFusionContext,
): string {
  const fusionSection = [
    "",
    "【热点融合指令】",
    `热点话题：${fusion.hotTopicTitle}`,
    `热点切入点：`,
    ...fusion.talkingPoints.map((tp, i) => `  ${i + 1}. ${tp}`),
    "",
    "要求：将热点话题自然融入文案开头或核心论述中，但不能喧宾夺主。",
    "热点是桥梁，最终要回到 IP 的核心价值主张和 CTA。",
    "",
  ].join("\n")

  return baseContextBlock + fusionSection
}

async function generateSingleBatch(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<{ candidates: string[]; promptText: string }> {
  try {
    const metaPrompt = await withTimeout(
      generateMetaPrompt(llm, contextBlock, params),
      STEP_TIMEOUT_MS,
      "batch-meta",
    )
    const candidates = await withTimeout(
      generateScriptsWithPrompt(llm, metaPrompt),
      STEP_TIMEOUT_MS,
      "batch-scripts",
    )
    return { candidates, promptText: metaPrompt }
  } catch {
    try {
      return await withTimeout(
        generateScriptsDirectly(llm, contextBlock, params),
        STEP_TIMEOUT_MS * 2,
        "batch-direct",
      )
    } catch {
      // Return empty — caller will get degraded result
      return { candidates: [], promptText: contextBlock }
    }
  }
}

// ─── Step 1: Build context & generate meta-prompt ──────────

function buildContextBlock(params: GenerateScriptCandidatesParams): string {
  const { template, inputs, hotTopicContext, ipProfile, structure, topicContext } = params

  const inputLines = Object.entries(inputs)
    .map(([key, value]) => `- ${key}: ${value}`)
    .join("\n")

  const sections: string[] = []

  if (ipProfile?.promptSnapshot) {
    sections.push(
      "【个人IP档案】",
      ipProfile.promptSnapshot,
      "",
    )
  }

  // IP 写作风格档案：描述「怎么想、怎么说」的认知模型，让措辞/节奏/语气贴合该 IP 的长期风格
  if (params.styleProfileBlock) {
    sections.push(
      "【写作风格档案 · 全局风格】",
      "以下是这位 IP 的长期写作风格认知模型（思维/情绪/结构/语言/价值观）。请在保持本次选题和结构节拍的同时，让措辞、节奏、语气贴合该风格。",
      params.styleProfileBlock,
      "",
    )
  }

  // COPY-01: Inject topic title + element tags when available
  if (topicContext) {
    sections.push(
      "【选题信息】",
      `选题标题：${topicContext.topicTitle}`,
      `营销元素：${topicContext.elementTags.join("、")}`,
      "",
    )

    // COPY-01: Opening formula templates
    sections.push(
      "【开场公式】",
      `开场类型：${topicContext.openingTypeName}（${topicContext.openingTypeCode}）`,
      `公式模板：`,
      ...topicContext.openingFormulas.map((f, i) => `  ${i + 1}. ${f}`),
      "",
    )

    // COPY-01/COPY-03: Structure beat sequences
    sections.push(
      "【文案结构节拍】",
      `结构类型：${topicContext.copyStructureName}（${topicContext.copyStructureCode}）`,
      `节拍序列：`,
      ...topicContext.copyStructureBeats.map(
        (beat, i) => `  第${i + 1}拍 [${beat.label}]：${beat.instruction}`,
      ),
      "",
    )

    // COPY-01: Ending type requirements
    sections.push(
      "【结尾要求】",
      `结尾类型：${topicContext.endingTypeName}（${topicContext.endingTypeCode}）`,
      `结尾指导：${topicContext.endingGuidance}`,
      `结尾模式：`,
      ...topicContext.endingPatterns.map((p, i) => `  ${i + 1}. ${p}`),
      "",
    )
  }

  if (structure) {
    const bp = structure.blueprint
    sections.push(
      "【视频结构蓝图】",
      `结构名：${structure.displayName}`,
      `开场模式：${bp.openingPattern}`,
      `叙事节拍：${bp.narrativeBeats.join(" -> ")}`,
      `证据位数量：${bp.evidenceSlots}`,
      `CTA 方式：${bp.ctaSlot}`,
      `节奏：${bp.pace ?? "medium"}`,
      `证据密度：${bp.evidenceDensity ?? "medium"}`,
      `CTA 强度：${bp.ctaStyle ?? "direct"}`,
      `建议时长：${bp.durationRange.min}-${bp.durationRange.max}秒（按每秒3-4字估算字数）`,
      "",
    )
  }

  sections.push(
    "【表达模板】",
    `模板名：${template.displayName}`,
    `模板说明：${template.description || "未提供"}`,
    `钩子类型：${template.hookType || "未提供"}`,
    `模板蓝图：${template.scriptTemplate}`,
    "",
  )

  if (template.expressionBlueprint) {
    sections.push(
      "【表达蓝图】",
      `论证模式：${template.expressionBlueprint.argumentPattern}`,
      `证据要求：${template.expressionBlueprint.proofBurden}`,
      `CTA 风格：${template.expressionBlueprint.ctaStyle}`,
      `热点适配：${template.expressionBlueprint.hotTopicModes.join(" / ") || "未提供"}`,
      `推荐搭配结构：${template.expressionBlueprint.recommendedStructures.join(" / ") || "未提供"}`,
      "",
    )
  }

  sections.push(
    "【视频 Brief】",
    inputLines || "未提供",
    "",
  )

  if (hotTopicContext) {
    sections.push(buildHotTopicPromptSection(hotTopicContext.insight, hotTopicContext.fit))
  }

  return sections.join("\n")
}

async function generateMetaPrompt(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<string> {
  const tc = params.topicContext

  // COPY-02: Build opening formula constraint for the system prompt
  const openingConstraint = tc
    ? [
        "",
        "【开场公式约束】",
        `每条文案的 openingStrategy 必须基于以下开场公式模板之一进行创作：`,
        ...tc.openingFormulas.map((f, i) => `  公式${i + 1}：${f}`),
        `开场类型要求：${tc.openingTypeName}`,
        "三条文案可以选择不同的公式，但都必须属于上述开场类型。",
      ].join("\n")
    : ""

  // COPY-03: Build beat-by-beat narrative constraint
  const beatConstraint = tc
    ? [
        "",
        "【叙事节拍约束】",
        `每条文案的 narrativeStyle 必须严格遵循以下节拍顺序：`,
        ...tc.copyStructureBeats.map(
          (beat, i) => `  第${i + 1}拍 [${beat.label}]：${beat.instruction}`,
        ),
        `文案结构类型：${tc.copyStructureName}`,
        "文案内容必须按顺序覆盖每个节拍，不允许跳过或乱序。",
      ].join("\n")
    : ""

  // Ending type constraint for endingRequirement
  const endingConstraint = tc
    ? [
        "",
        "【结尾类型约束】",
        `每条文案的 endingRequirement 必须遵循「${tc.endingTypeName}」类型的结尾指导：`,
        tc.endingGuidance,
        `可参考结尾模式：`,
        ...tc.endingPatterns.map((p, i) => `  ${i + 1}. ${p}`),
      ].join("\n")
    : ""

  const result = await llm.complete({
    model: META_MODEL,
    messages: [
      {
        role: "system",
        content: [
          "你是一位短视频营销策略专家。你的任务是：根据用户提供的上下文信息，为 3 条短视频文案分别生成完整的创作方向。",
          "必须输出 JSON 对象，不要输出解释文字。",
          "",
          "输出格式：",
          "{",
          '  "directions": [',
          '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."},',
          '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."},',
          '    {"openingStrategy": "...", "narrativeStyle": "...", "coreArgument": "...", "endingRequirement": "..."}',
          "  ]",
          "}",
          "",
          "要求：",
          "1. 必须返回 3 条 directions，不能少。",
          "2. 每条 direction 的四个字段都必须完整、具体、可执行，不能只写半句。",
          "3. 三条文案的开场策略和叙事风格必须明显不同。",
          "4. 如果提供了热点洞察与适配结论，必须遵守适配结论；当结论为 caution 或 avoid 时，不得强行把热点标题硬塞进文案。",
          "5. 结尾要求必须包含明确 CTA 导向。",
          openingConstraint,
          beatConstraint,
          endingConstraint,
        ].filter(Boolean).join("\n"),
      },
      {
        role: "user",
        content: `请为以下上下文生成文案创作指令：\n\n${contextBlock}`,
      },
    ],
    temperature: 0.4,
    maxTokens: 1500,
    responseFormat: { type: "json_object" },
  })

  const directions = parseScriptDirections(result.content)
  if (directions.length < 3) {
    console.warn("[script-generator] Meta prompt directions invalid, got", directions.length, "valid directions from:", result.content.slice(0, 300))
    throw new Error("[script-generator] Meta prompt directions invalid")
  }

  return buildMetaPromptText(contextBlock, params, directions)
}

// ─── Step 2: Generate scripts using meta-prompt ────────────

async function generateScriptsWithPrompt(
  llm: LLMClient,
  metaPrompt: string,
): Promise<string[]> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      model: SCRIPT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是一位顶级短视频口播文案创作者。",
            "严格按照指令创作。",
            "你不能输出错误说明、补充要求、道歉、解释或调试信息。",
            '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
            "",
            "【反AI味硬性规则——必须遵守】",
            "1. 禁用词清单（出现任何一个都是严重扣分项）：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
            "2. 禁止排比三连（三个以上相同句式连续出现）。",
            "3. 禁止'首先...其次...最后...'这类文章式过渡。",
            "4. 禁止'不是...而是...'、'与其...不如...'这类套路句式连续出现超过一次。",
            "5. 用口语化短句，像真人在跟镜头说话，不是在写公众号文章。",
            "6. 允许适度口语词（啊、呢、吧、嘛），但不要刻意堆砌。",
            "7. 每条文案前3秒必须有具体信息或反常识表述，禁止用'今天我们来聊一个...'这类万能开场。",
          ].join("\n"),
        },
        {
          role: "user",
          content:
            metaPrompt +
            "\n\n最终输出格式：JSON 对象，键名必须是 scripts，值必须是 3 条可直接朗读的纯文本字符串。不要包含任何结构标签、括号注释、错误说明或 markdown。",
        },
      ],
      temperature: attempt === 0 ? 0.85 : 0.55,
      maxTokens: 3200,
      responseFormat: { type: "json_object" },
    })

    const candidates = sanitizeScriptCandidates(parseScriptCandidates(result.content))
    if (candidates.length >= 3) {
      return candidates.slice(0, 3)
    }
  }

  throw new Error("[script-generator] Script candidates invalid")
}

async function generateScriptsDirectly(
  llm: LLMClient,
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): Promise<{ candidates: string[]; promptText: string }> {
  const promptText = buildDirectGenerationPrompt(contextBlock, params)

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const result = await llm.complete({
      model: SCRIPT_MODEL,
      messages: [
        {
          role: "system",
          content: [
            "你是一位顶级短视频口播文案创作者。",
            "你必须直接交付结果，不允许回复缺少信息、需要补充、无法执行、报错说明或调试文字。",
            '你只能输出 JSON 对象：{"scripts":["...","...","..."]}。',
            "",
            "【反AI味硬性规则——必须遵守】",
            "1. 禁用词：赋能、痛点、赛道、底层逻辑、闭环、矩阵、抓手、沉淀、打法、心智、颗粒度、链路、复用、拉齐、对齐、盘活、破圈、种草、拔草、转化链路、商业闭环、价值主张、核心壁垒、差异化打法、降维打击、认知升级。",
            "2. 禁止排比三连、文章式过渡（首先...其次...最后...）、套路句式连续重复。",
            "3. 口语化短句，像真人跟镜头说话，前3秒必须有具体信息或反常识表述。",
          ].join("\n"),
        },
        {
          role: "user",
          content: promptText,
        },
      ],
      temperature: attempt === 0 ? 0.7 : 0.45,
      maxTokens: 3200,
      responseFormat: { type: "json_object" },
    })

    const candidates = sanitizeScriptCandidates(parseScriptCandidates(result.content))
    if (candidates.length >= 3) {
      return { candidates: candidates.slice(0, 3), promptText }
    }
  }

  throw new Error("[script-generator] Direct recovery candidates invalid")
}

/** Strip structural/meta notes that LLMs sometimes prepend to scripts */
function cleanScriptContent(script: string): string {
  return script
    // Remove lines like "本条文案采用「xxx」结构。" or "整体表达口吻请保持xxx。"
    .replace(/^本条文案采用[^。]*。\s*/g, "")
    .replace(/^整体表达口吻[^。]*。\s*/g, "")
    .replace(/^【[^】]+】\s*/g, "")
    .replace(/^文案\d+[:：]\s*/g, "")
    .trim()
}

// ─── v2 IP profile field resolver ─────────────────────────

interface ResolvedScoringFields {
  displayName: string
  industry: string
  ipTraits: string
  toneOfVoice: string
  callToAction: string
  proofPoints: string
  targetAudience: string
  nickname: string
}

function resolveScriptScoringFields(
  ipProfile: GenerateScriptCandidatesParams["ipProfile"]
): ResolvedScoringFields {
  if (!ipProfile) {
    return { displayName: "", nickname: "", industry: "", ipTraits: "", toneOfVoice: "", callToAction: "", proofPoints: "", targetAudience: "" }
  }
  return {
    displayName: ipProfile.displayName || "",
    nickname: ipProfile.nickname || "",
    industry: ipProfile.industry || "",
    ipTraits: ipProfile.ipTraits || "",
    toneOfVoice: ipProfile.toneOfVoice || "",
    callToAction: ipProfile.callToAction || "",
    proofPoints: ipProfile.proofPoints || "",
    targetAudience: ipProfile.targetAudience || "",
  }
}

// ─── Step 3: AI-based scoring (COPY-05 upgrade) ────────────

async function scoreWithAI(
  llm: LLMClient,
  candidates: string[],
  params: GenerateScriptCandidatesParams,
): Promise<CandidateScore[]> {
  const { structure, ipProfile, inputs, topicContext } = params

  const resolved = resolveScriptScoringFields(ipProfile)
  const scoringContext = [
    `请为以下 ${candidates.length} 条短视频口播文案打分（0-100），评估维度：`,
    "",
    "1. structuralCompliance：是否遵循了视频结构蓝图的叙事节拍顺序",
    "2. briefCoverage：是否覆盖了用户Brief中的关键信息",
    "3. evidenceStrength：是否有具体的数据/案例/经验作为支撑",
    "4. ctaClarity：结尾是否有清晰的行动引导",
    "5. voiceFit：口吻是否匹配IP档案的人设和表达风格",
    "6. lengthOk：文案长度是否合理（1=合理，0=过长或过短）",
  ]

  // COPY-05: Add new scoring dimensions when topic context is available
  if (topicContext) {
    scoringContext.push(
      "7. openingFormulaCompliance：开场是否遵循了指定的开场公式模板",
      "8. endingTypeCompliance：结尾是否符合指定的结尾类型要求",
    )
  }

  scoringContext.push(
    "",
    "评分上下文：",
    `IP名称：${resolved.displayName || "未知"}`,
    `行业：${resolved.industry || "未知"}`,
    `口吻要求：${resolved.toneOfVoice || "未指定"}`,
    `IP特征：${resolved.ipTraits || "未指定"}`,
    `CTA方式：${resolved.callToAction || "未指定"}`,
  )

  if (structure) {
    scoringContext.push(
      `结构名：${structure.displayName}`,
      `叙事节拍：${structure.blueprint.narrativeBeats.join(" -> ")}`,
      `建议时长：${structure.blueprint.durationRange.min}-${structure.blueprint.durationRange.max}秒`,
    )
  }

  // COPY-05: Add opening/ending context for compliance scoring
  if (topicContext) {
    scoringContext.push(
      "",
      "开场公式评判标准：",
      `开场类型：${topicContext.openingTypeName}`,
      `公式模板：${topicContext.openingFormulas.join(" | ")}`,
      "",
      "结尾类型评判标准：",
      `结尾类型：${topicContext.endingTypeName}`,
      `结尾指导：${topicContext.endingGuidance}`,
      `结尾模式：${topicContext.endingPatterns.join(" | ")}`,
    )
  }

  const briefSummary = Object.entries(inputs)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ")
  scoringContext.push(`Brief要点：${briefSummary}`)

  const outputFields = topicContext
    ? "structuralCompliance, briefCoverage, evidenceStrength, ctaClarity, voiceFit, lengthOk(0或1), openingFormulaCompliance, endingTypeCompliance, overall"
    : "structuralCompliance, briefCoverage, evidenceStrength, ctaClarity, voiceFit, lengthOk(0或1), overall"

  scoringContext.push(
    "",
    "文案内容：",
    ...candidates.map((c, i) => `--- 文案${i + 1} ---\n${c}`),
    "",
    `输出纯 JSON 数组，包含 ${candidates.length} 个对象，每个对象有 ${outputFields} 字段。overall 是加权综合分。`,
  )

  try {
    const result = await llm.complete({
      model: SCORE_MODEL,
      messages: [
        {
          role: "system",
          content: "你是一位严格的短视频文案质量审核专家。只输出纯 JSON，不添加任何说明。",
        },
        { role: "user", content: scoringContext.join("\n") },
      ],
      temperature: 0.2,
      maxTokens: 800,
      responseFormat: { type: "json_object" },
    })

    return parseAIScores(result.content, candidates.length)
  } catch {
    // Fallback to keyword-based scoring if AI scoring fails
    return candidates.map((c) => scoreWithKeywords(c, params))
  }
}

function parseAIScores(content: string, count: number): CandidateScore[] {
  const raw = content.trim()
  // Try multiple extraction strategies
  const attempts = [
    raw,
    raw.replace(/```(?:json)?\s*/g, "").replace(/```/g, "").trim(),
    (() => {
      const s = raw.indexOf("["), e = raw.lastIndexOf("]")
      return s !== -1 && e > s ? raw.slice(s, e + 1) : ""
    })(),
    (() => {
      const s = raw.indexOf("{"), e = raw.lastIndexOf("}")
      return s !== -1 && e > s ? `[${raw.slice(s, e + 1)}]` : ""
    })(),
  ]

  for (const attempt of attempts) {
    if (!attempt) continue
    try {
      const parsed = JSON.parse(attempt)
      const arr = Array.isArray(parsed) ? parsed : parsed?.scores ?? [parsed]
      if (arr.length >= count) {
        return arr.slice(0, count).map((s: Record<string, number>) => ({
          overall: clamp(s.overall ?? 50),
          structuralCompliance: clamp(s.structuralCompliance ?? 50),
          viewpointClarity: clamp(s.briefCoverage ?? 50),
          evidenceStrength: clamp(s.evidenceStrength ?? 50),
          ctaClarity: clamp(s.ctaClarity ?? 50),
          voiceFit: clamp(s.voiceFit ?? 50),
          lengthInRange: (s.lengthOk ?? 1) === 1,
          // COPY-05: new dimensions (default 50 if not returned by AI)
          openingFormulaCompliance: clamp(s.openingFormulaCompliance ?? 50),
          endingTypeCompliance: clamp(s.endingTypeCompliance ?? 50),
        }))
      }
    } catch {
      // try next
    }
  }

  // Return default scores if parsing fails
  return Array.from({ length: count }, () => ({
    overall: 50,
    structuralCompliance: 50,
    viewpointClarity: 50,
    evidenceStrength: 50,
    ctaClarity: 50,
    voiceFit: 50,
    lengthInRange: true,
    openingFormulaCompliance: 50,
    endingTypeCompliance: 50,
  }))
}

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)))
}

// ─── Fallback: keyword-based scoring ───────────────────────

function extractKeywords(text: string | null | undefined): string[] {
  if (!text) return []
  return text.split(/[\s,，、/;；|]+/).filter((w) => w.length >= 2)
}

function scoreWithKeywords(
  candidate: string,
  params: GenerateScriptCandidatesParams,
): CandidateScore {
  const { structure, ipProfile, inputs, topicContext } = params
  const resolved = resolveScriptScoringFields(ipProfile)

  let structuralCompliance = 60
  if (structure) {
    const beats = structure.blueprint.narrativeBeats
    if (beats.length > 0) {
      const matched = beats.filter((beat) =>
        extractKeywords(beat).some((kw) => candidate.includes(kw)),
      )
      structuralCompliance = Math.round((matched.length / beats.length) * 100)
    }
  }

  let briefCoverage = 60
  const inputValues = Object.values(inputs).filter((v) => v.trim().length >= 2)
  if (inputValues.length > 0) {
    const matched = inputValues.filter((v) =>
      extractKeywords(v).some((kw) => candidate.includes(kw)),
    )
    briefCoverage = Math.round((matched.length / inputValues.length) * 100)
  }

  let evidenceStrength = 50
  const proofKw = extractKeywords(resolved.proofPoints)
  if (proofKw.length > 0) {
    const hits = proofKw.filter((kw) => candidate.includes(kw)).length
    evidenceStrength = Math.min(100, Math.round((hits / Math.max(1, proofKw.length)) * 100))
  }
  if ((candidate.match(/\d+/g) || []).length >= 2) {
    evidenceStrength = Math.min(100, evidenceStrength + 25)
  }

  let ctaClarity = 40
  const lastPart = candidate.slice(Math.floor(candidate.length * 0.6))
  const ctaKw = [structure?.blueprint?.ctaSlot, resolved.callToAction]
    .filter(Boolean)
    .flatMap((s) => extractKeywords(s as string))
  if (ctaKw.length > 0) {
    const hits = ctaKw.filter((kw) => lastPart.includes(kw)).length
    ctaClarity = Math.min(100, Math.round((hits / Math.max(1, ctaKw.length)) * 100))
  }

  let voiceFit = 50
  const vKw = [...extractKeywords(resolved.toneOfVoice), ...extractKeywords(resolved.ipTraits)]
  if (vKw.length > 0) {
    const hits = vKw.filter((kw) => candidate.includes(kw)).length
    voiceFit = Math.min(100, Math.round((hits / Math.max(1, vKw.length)) * 100))
  }
  if (resolved.displayName && candidate.includes(resolved.displayName)) voiceFit = Math.min(100, voiceFit + 20)

  let lengthInRange = true
  if (structure) {
    const { min, max } = structure.blueprint.durationRange
    lengthInRange = candidate.length >= min * 3 && candidate.length <= max * 4
  }

  // COPY-05: Opening formula compliance (keyword-based fallback)
  let openingFormulaCompliance = 50
  if (topicContext) {
    const openingPart = candidate.slice(0, Math.min(80, Math.floor(candidate.length * 0.2)))
    const formulaKw = topicContext.openingFormulas.flatMap((f) => extractKeywords(f))
    if (formulaKw.length > 0) {
      const hits = formulaKw.filter((kw) => openingPart.includes(kw)).length
      openingFormulaCompliance = Math.min(100, Math.round((hits / Math.max(1, formulaKw.length)) * 100))
    }
  }

  // COPY-05: Ending type compliance (keyword-based fallback)
  let endingTypeCompliance = 50
  if (topicContext) {
    const endingPart = candidate.slice(Math.floor(candidate.length * 0.7))
    const endingKw = [
      ...extractKeywords(topicContext.endingGuidance),
      ...topicContext.endingPatterns.flatMap((p) => extractKeywords(p)),
    ]
    if (endingKw.length > 0) {
      const hits = endingKw.filter((kw) => endingPart.includes(kw)).length
      endingTypeCompliance = Math.min(100, Math.round((hits / Math.max(1, endingKw.length)) * 100))
    }
  }

  const hasStructure = !!structure
  const hasTopicContext = !!topicContext

  // COPY-05: Updated weight distribution
  // When topic context is present, openingFormulaCompliance (0.12) and endingTypeCompliance (0.08) take from other weights
  const overall = hasTopicContext
    ? Math.round(
        structuralCompliance * (hasStructure ? 0.15 : 0.03) +
        briefCoverage * 0.20 +
        evidenceStrength * 0.12 +
        ctaClarity * 0.12 +
        voiceFit * 0.11 +
        openingFormulaCompliance * 0.12 +
        endingTypeCompliance * 0.08 +
        (lengthInRange ? 10 : 0),
      )
    : Math.round(
        structuralCompliance * (hasStructure ? 0.20 : 0.05) +
        briefCoverage * 0.25 +
        evidenceStrength * 0.15 +
        ctaClarity * 0.15 +
        voiceFit * 0.15 +
        (lengthInRange ? 10 : 0),
      )

  return {
    overall,
    structuralCompliance,
    viewpointClarity: briefCoverage,
    evidenceStrength,
    ctaClarity,
    voiceFit,
    lengthInRange,
    openingFormulaCompliance,
    endingTypeCompliance,
  }
}

// ─── JSON parsing helpers ──────────────────────────────────

function parseScriptCandidates(content: string): string[] {
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

function parseScriptDirections(content: string): ScriptDirection[] {
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

function buildMetaPromptText(
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
  directions: ScriptDirection[],
): string {
  const lines = [
    "请根据以下上下文创作 3 条短视频口播文案。",
    "",
    contextBlock,
    "",
    "【共通要求】",
    "- 文案是可直接朗读的纯口播文本。",
    "- 不要输出任何结构标签、说明、括号注释、错误提示或 markdown。",
    "- 每条文案都要落到明确 CTA。",
  ]

  if (params.structure) {
    lines.push(
      `- 时长控制在 ${params.structure.blueprint.durationRange.min}-${params.structure.blueprint.durationRange.max} 秒。`,
    )
  }

  // COPY-03: Add beat-by-beat instructions to the meta-prompt
  if (params.topicContext) {
    const tc = params.topicContext
    lines.push(
      "",
      "【节拍遵循要求】",
      `文案必须按以下节拍顺序组织内容（${tc.copyStructureName}）：`,
    )
    tc.copyStructureBeats.forEach((beat, i) => {
      lines.push(`  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    })
    lines.push(
      "",
      `结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
    )
  }

  lines.push("", "【三条文案的具体方向】")

  directions.forEach((direction, index) => {
    lines.push(
      `文案${index + 1}:`,
      `- 开场策略：${direction.openingStrategy}`,
      `- 叙事风格：${direction.narrativeStyle}`,
      `- 核心论点：${direction.coreArgument}`,
      `- 结尾要求：${direction.endingRequirement}`,
    )
  })

  return lines.join("\n")
}

function buildDirectGenerationPrompt(
  contextBlock: string,
  params: GenerateScriptCandidatesParams,
): string {
  const lines = [
    "请基于以下上下文，直接创作 3 条不同角度的短视频口播文案。",
    "",
    contextBlock,
    "",
    "【硬性要求】",
    "- 最终输出 JSON 对象，键名必须是 scripts，值必须是 3 条字符串。",
    "- 每条文案都要是可以直接朗读的纯文本，不要结构标签、括号注释、解释、道歉、报错或补充要求。",
    "- 三条文案的开场切入必须明显不同，不能只是改几个词。",
    "- 文案要自然使用 IP 的身份、Brief 信息和 CTA，不要把提示词原话照搬进成片文案。",
    "- 如果有热点适配判断，必须遵守；当结论为 caution 或 avoid 时，只能借情绪或观点，不能强蹭标题。",
  ]

  if (params.structure) {
    lines.push(
      `- 单条文案时长控制在 ${params.structure.blueprint.durationRange.min}-${params.structure.blueprint.durationRange.max} 秒。`,
    )
  }

  // COPY-03: Add beat constraints to direct generation prompt too
  if (params.topicContext) {
    const tc = params.topicContext
    lines.push(
      "",
      `- 文案结构必须按「${tc.copyStructureName}」的节拍顺序组织：`,
    )
    tc.copyStructureBeats.forEach((beat, i) => {
      lines.push(`  第${i + 1}拍 [${beat.label}]：${beat.instruction}`)
    })
    lines.push(
      `- 开场必须遵循「${tc.openingTypeName}」的公式风格`,
      `- 结尾必须符合「${tc.endingTypeName}」类型：${tc.endingGuidance}`,
    )
  }

  return lines.join("\n")
}

function sanitizeScriptCandidates(candidates: string[]): string[] {
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

function buildGenerationResult(
  candidates: string[],
  scores: CandidateScore[],
  promptText: string,
  model: string,
): ScriptGenerationResult {
  const indexed = candidates.map((candidate, index) => ({
    candidate,
    score: scores[index],
  }))
  indexed.sort((a, b) => b.score.overall - a.score.overall)

  return {
    candidates: indexed.map((item) => item.candidate),
    scores: indexed.map((item) => item.score),
    promptText,
    model,
    isDegraded: indexed.length === 0 || indexed[0].score.overall < 60,
  }
}

// ─── Rule-based fallback (no LLM) ─────────────────────────

function fallbackResult(params: GenerateScriptCandidatesParams): ScriptGenerationResult {
  const candidates = generateWithFallback(params)
  const scores = candidates.map((c) => scoreWithKeywords(c, params))
  const indexed = candidates.map((c, i) => ({ candidate: c, score: scores[i] }))
  indexed.sort((a, b) => b.score.overall - a.score.overall)

  return {
    candidates: indexed.map((i) => i.candidate),
    scores: indexed.map((i) => i.score),
    promptText: buildContextBlock(params),
    model: DEFAULT_MODEL,
    isDegraded: true,
  }
}

function generateWithFallback(params: GenerateScriptCandidatesParams): string[] {
  const { template, inputs, hotTopicContext, ipProfile } = params
  const resolved = resolveScriptScoringFields(ipProfile)
  const base = renderTemplate(template.scriptTemplate, inputs)
  const opener = hotTopicContext
    ? hotTopicContext.fit.verdict === "strong"
      ? `最近「${hotTopicContext.title}」这个话题很火，它真正戳中的，是${hotTopicContext.fit.bridgeReason}`
      : hotTopicContext.fit.verdict === "caution"
        ? `最近很多人都在聊「${hotTopicContext.title}」，但比跟风更重要的，是看懂这件事背后的${hotTopicContext.fit.recommendedAngle}`
        : ""
    : ""
  const identity = resolved.displayName || resolved.nickname
    ? `我是${resolved.displayName || resolved.nickname}。`
    : ""
  const authority = resolved.proofPoints
    ? `先说结论，我的判断来自这些真实经验：${resolved.proofPoints}。`
    : ""
  const cta = resolved.callToAction
    ? `如果你也想把这套方法用到自己的生意里，${resolved.callToAction}。`
    : "如果你也遇到类似问题，评论区告诉我。"
  const targetAudience = resolved.targetAudience
    ? `如果你正是${resolved.targetAudience}，这条内容尤其适合你。`
    : ""
  const tone = resolved.toneOfVoice
    ? `整体表达口吻请保持${resolved.toneOfVoice}。`
    : ""
  const trait = resolved.ipTraits ? `记住，你的人设重点是${resolved.ipTraits}。` : ""
  const caution = hotTopicContext?.fit.caution?.length
    ? `避开这些硬蹭方式：${hotTopicContext.fit.caution.join("；")}。`
    : ""

  return [
    [opener, identity, base, authority, cta].filter(Boolean).join(" "),
    [identity, targetAudience, base, trait, cta].filter(Boolean).join(" "),
    [opener, caution, tone, base, cta].filter(Boolean).join(" "),
  ].map((c) => c.trim())
}

// ─── Per-step timeout helper ──────────────────────────────

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`[script-generator] ${label} timed out after ${ms}ms`)),
      ms,
    )
    promise
      .then((v) => { clearTimeout(timer); resolve(v) })
      .catch((e) => { clearTimeout(timer); reject(e) })
  })
}

// ─── Exports for route handler ─────────────────────────────

export function buildPrompt(params: GenerateScriptCandidatesParams): string {
  return buildContextBlock(params)
}
