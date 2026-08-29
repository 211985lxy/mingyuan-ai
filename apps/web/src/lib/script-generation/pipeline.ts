import { LLMClient } from "@/lib/llm"
import { createGatewayLLM } from "@/lib/llm/gateway-client"
import { buildContextBlock } from "./context"
import type { GenerateScriptCandidatesParams, HotTopicFusionContext, ScriptGenerationResult } from "./contracts"
import { fallbackResult } from "./fallback"
import { generateMetaPrompt, generateScriptsDirectly, generateScriptsWithPrompt } from "./generation"
import { SCRIPT_MODEL, STEP_TIMEOUT_MS } from "./models"
import { scoreWithAI } from "./scoring"
import { buildGenerationResult, withTimeout } from "./utils"

/**
 * @description 生成scriptcandidates
 * @param params - 参数对象
 * @returns Promise<ScriptGenerationResult>
 */
export async function generateScriptCandidates(
  params: GenerateScriptCandidatesParams
): Promise<ScriptGenerationResult> {
  const llm = createGatewayLLM()

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
