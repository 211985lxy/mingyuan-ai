import { NextResponse } from "next/server"
import { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { withUserAuth } from "@/lib/user-auth"
import { validateVariables } from "@/lib/template-engine"
import { generateScriptCandidates } from "@/lib/script-generator"
import { getStyleProfileBlock } from "@/lib/style-profile"
import {
  HotTopicIntelligenceError,
  evaluateHotTopicFit,
  getOrGenerateHotTopicInsight,
} from "@/lib/hot-topic-intelligence"
import type { StructureBlueprint, TopicContext, HotTopicFusionContext } from "@/lib/script-generator"
import type { ApiHotTopicFit, ApiHotTopicInsight } from "@/types/api"
import type { ExpressionBlueprint, TemplateVariable } from "@/types/content-template"
import { ownsActiveProject } from "@/lib/resource-ownership"

// Allow up to 120 seconds for script generation (3-step LLM chain can take 30-60s)
export const maxDuration = 120

// ─── Types for DB-fetched topic engine records ─────────────

interface OpeningTypeRecord {
  code: string
  name: string
  formulas: unknown // Json
}

interface CopyStructureRecord {
  code: string
  name: string
  beats: unknown // Json
}

interface EndingTypeRecord {
  code: string
  name: string
  guidance: string
  patterns: unknown // Json
}

interface CopyBeat {
  label: string
  instruction: string
}

export const POST = withUserAuth(async (request, { user }) => {
  const requestId = `script-gen-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  console.log(`[${requestId}] Script generation initiated by user ${user.id}`)

  const body = await request.json()
  const templateId = typeof body.templateId === "string" ? body.templateId : ""
  const structureId = typeof body.structureId === "string" ? body.structureId : ""
  const hotTopicId = typeof body.hotTopicId === "string" ? body.hotTopicId : null
  const hotTopic = typeof body.hotTopic === "string" ? body.hotTopic : null
  const inputs =
    body.inputs && typeof body.inputs === "object"
      ? (body.inputs as Record<string, string>)
      : null

  // Phase 14: Optional topic selection context fields
  const topicSelectionId = typeof body.topicSelectionId === "string" ? body.topicSelectionId : null
  const openingTypeCode = typeof body.openingTypeCode === "string" ? body.openingTypeCode : null
  const copyStructureCode = typeof body.copyStructureCode === "string" ? body.copyStructureCode : null
  const endingTypeCode = typeof body.endingTypeCode === "string" ? body.endingTypeCode : null
  // Phase 14: COPY-04 hot topic fusion
  const hotTopicFusionTitle = typeof body.hotTopicFusionTitle === "string" ? body.hotTopicFusionTitle : null
  const hotTopicFusionPoints = Array.isArray(body.hotTopicFusionPoints) ? body.hotTopicFusionPoints as string[] : null
  const projectId = typeof body.projectId === "string" && body.projectId ? body.projectId : undefined

  console.log(`[${requestId}] Request params: templateId=${templateId}, structureId=${structureId}, hotTopicId=${hotTopicId || 'none'}, topicSelectionId=${topicSelectionId || 'none'}, inputKeys=${inputs ? Object.keys(inputs).join(',') : 'none'}`)

  if (!templateId || !inputs || !structureId) {
    console.warn(`[${requestId}] Validation failed: missing required fields`)
    return NextResponse.json(
      { error: "templateId, structureId, and inputs are required" },
      { status: 400 }
    )
  }

  if (projectId && !(await ownsActiveProject(user.id, projectId))) {
    return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
  }

  const [template, videoStructure] = await Promise.all([
    prisma.contentTemplate.findUnique({
      where: { id: templateId, status: "published" },
      select: {
        id: true,
        displayName: true,
        description: true,
        scriptTemplate: true,
        expressionBlueprint: true,
        hookType: true,
        variables: true,
      },
    }),
    prisma.videoStructure.findFirst({
      where: {
        OR: [{ id: structureId }, { name: structureId }],
        status: "published",
      },
      select: {
        id: true,
        displayName: true,
        blueprint: true,
      },
    }),
  ])

  if (!template) {
    console.warn(`[${requestId}] Template not found: ${templateId}`)
    return NextResponse.json({ error: "Template not found" }, { status: 404 })
  }

  if (!videoStructure) {
    console.warn(`[${requestId}] Video structure not found: ${structureId}`)
    return NextResponse.json(
      { error: "Video structure not found" },
      { status: 400 }
    )
  }

  console.log(`[${requestId}] Loaded template "${template.displayName}" and structure "${videoStructure.displayName}"`)

  const definitions = Array.isArray(template.variables)
    ? (template.variables as unknown as TemplateVariable[])
    : []

  // v5 topic-driven flow skips template variable validation
  // (topic context replaces template inputs)
  if (!topicSelectionId) {
    const missing = validateVariables(definitions, inputs)
    if (missing.length > 0) {
      return NextResponse.json(
        { error: `Missing required variables: ${missing.join(", ")}` },
        { status: 400 }
      )
    }
  }

  const blueprint = videoStructure.blueprint as unknown as StructureBlueprint
  const expressionBlueprint = template.expressionBlueprint as ExpressionBlueprint | null
  let hotTopicInsight: ApiHotTopicInsight | null = null
  let hotTopicFit: ApiHotTopicFit | null = null
  let resolvedHotTopic = hotTopic

  if (hotTopicId) {
    try {
      const { topic, insight } = await getOrGenerateHotTopicInsight(hotTopicId)
      const fit = await evaluateHotTopicFit({
        topicTitle: topic.title,
        insight,
        ipProfile: undefined,
        template: {
          id: template.id,
          displayName: template.displayName,
          description: template.description,
          hookType: template.hookType,
          scriptTemplate: template.scriptTemplate,
          expressionBlueprint,
        },
        structure: {
          id: videoStructure.id,
          displayName: videoStructure.displayName,
          blueprint,
        },
        inputs,
      })

      resolvedHotTopic = topic.title
      hotTopicInsight = insight
      hotTopicFit = fit
    } catch (error) {
      if (error instanceof HotTopicIntelligenceError) {
        return NextResponse.json(
          { error: error.message, code: error.code },
          { status: error.status },
        )
      }
      throw error
    }
  }

  // Phase 14: Build topic context if topic selection codes are provided
  let topicContext: TopicContext | null = null
  if (topicSelectionId && openingTypeCode && copyStructureCode && endingTypeCode) {
    try {
      topicContext = await buildTopicContext(
        topicSelectionId,
        openingTypeCode,
        copyStructureCode,
        endingTypeCode,
        user.id,
      )
      console.log(`[${requestId}] Topic context loaded: opening=${openingTypeCode}, structure=${copyStructureCode}, ending=${endingTypeCode}`)
    } catch (error) {
      console.warn(`[${requestId}] Failed to build topic context:`, error)
      // Non-fatal: proceed without topic context (backward compatible)
    }
  }

  // Phase 14: COPY-04 hot topic fusion context
  let hotTopicFusion: HotTopicFusionContext | null = null
  if (hotTopicFusionTitle && hotTopicFusionPoints && hotTopicFusionPoints.length > 0) {
    hotTopicFusion = {
      hotTopicTitle: hotTopicFusionTitle,
      talkingPoints: hotTopicFusionPoints,
    }
    console.log(`[${requestId}] Hot topic fusion enabled: "${hotTopicFusionTitle}" with ${hotTopicFusionPoints.length} talking points`)
  }

  console.log(`[${requestId}] Starting script generation with model: ${template.displayName}`)
  const startTime = Date.now()

  try {
    // 用户级写作风格档案（项目内读项目风格，无项目读全局）
    const styleProfileBlock = await getStyleProfileBlock(user.id, projectId ?? null).catch(() => "")
    const generation = await generateScriptCandidates({
      template: {
        ...template,
        expressionBlueprint,
        variables: definitions,
      },
      inputs,
      hotTopicContext:
        hotTopicInsight && hotTopicFit && hotTopicId && resolvedHotTopic
          ? {
              topicId: hotTopicId,
              title: resolvedHotTopic,
              insight: hotTopicInsight,
              fit: hotTopicFit,
            }
          : null,
      ipProfile: null,
      structure: {
        displayName: videoStructure.displayName,
        blueprint,
      },
      topicContext,
      hotTopicFusion,
      styleProfileBlock,
    })

    const duration = Date.now() - startTime
    const bestScore = generation.scores.length > 0 ? generation.scores[0].overall : 0
    console.log(`[${requestId}] Script generation completed in ${duration}ms, model: ${generation.model}, isDegraded: ${generation.isDegraded}, bestScore: ${bestScore}, candidates: ${generation.candidates.length}${generation.hotTopicCandidates ? `, hotTopicCandidates: ${generation.hotTopicCandidates.length}` : ''}`)
    const hotTopicInsightJson = hotTopicInsight
      ? (JSON.parse(JSON.stringify(hotTopicInsight)) as Prisma.InputJsonValue)
      : undefined
    const hotTopicFitJson = hotTopicFit
      ? (JSON.parse(JSON.stringify(hotTopicFit)) as Prisma.InputJsonValue)
      : undefined

    console.log(`[${requestId}] Saving generation results to database`)

    const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      // COPY-06: Include topic selection fields in the generation run record
      const run = await tx.contentGenerationRun.create({
        data: {
          userId: user.id,
          ipProfileId: "",
          templateId: template.id,
          structureId: videoStructure.id,
          structureSnapshot: blueprint as unknown as Prisma.InputJsonValue,
          hotTopicId,
          hotTopic: resolvedHotTopic,
          hotTopicInsight: hotTopicInsightJson,
          hotTopicFit: hotTopicFitJson,
          inputsJson: inputs,
          promptText: generation.promptText,
          model: generation.model,
          status: generation.isDegraded ? "degraded" : "succeeded",
          qualityScore: bestScore,
          qualityMetadata: generation.scores as unknown as Prisma.InputJsonValue,
          // Phase 14: topic selection context
          topicSelectionId: topicContext?.topicSelectionId ?? null,
          openingTypeCode: topicContext?.openingTypeCode ?? null,
          copyStructureCode: topicContext?.copyStructureCode ?? null,
          endingTypeCode: topicContext?.endingTypeCode ?? null,
        },
      })

      // Create original scripts
      const scripts = await Promise.all(
        generation.candidates.map((content, i) =>
          tx.script.create({
            data: {
              userId: user.id,
              content,
              sourceTemplateId: template.id,
              generationRunId: run.id,
              ipProfileId: "",
              structureId: videoStructure.id,
              status: "candidate",
              qualityScore: generation.scores[i]?.overall ?? null,
              qualityMetadata: generation.scores[i]
                ? (generation.scores[i] as unknown as Prisma.InputJsonValue)
                : undefined,
              // COPY-06: topic selection reference
              topicSelectionId: topicContext?.topicSelectionId ?? null,
              isHotTopicVersion: false,
            },
          })
        )
      )

      // COPY-04/COPY-06: Create hot-topic fusion scripts if available
      let hotTopicScripts: typeof scripts = []
      if (generation.hotTopicCandidates && generation.hotTopicCandidates.length > 0) {
        hotTopicScripts = await Promise.all(
          generation.hotTopicCandidates.map((content, i) =>
            tx.script.create({
              data: {
                userId: user.id,
                content,
                sourceTemplateId: template.id,
                generationRunId: run.id,
                ipProfileId: "",
                structureId: videoStructure.id,
                status: "candidate",
                qualityScore: generation.hotTopicScores?.[i]?.overall ?? null,
                qualityMetadata: generation.hotTopicScores?.[i]
                  ? (generation.hotTopicScores[i] as unknown as Prisma.InputJsonValue)
                  : undefined,
                topicSelectionId: topicContext?.topicSelectionId ?? null,
                isHotTopicVersion: true,
              },
            })
          )
        )
      }

      return { run, scripts, hotTopicScripts }
    })

    console.log(`[${requestId}] Script generation completed successfully, runId: ${result.run.id}, scripts: ${result.scripts.length}, hotTopicScripts: ${result.hotTopicScripts.length}`)

    return NextResponse.json({
      data: {
        run: result.run,
        scripts: result.scripts,
        hotTopicScripts: result.hotTopicScripts.length > 0 ? result.hotTopicScripts : undefined,
        isDegraded: generation.isDegraded,
      },
    })
  } catch (error) {
    console.error(`[${requestId}] Script generation failed:`, error)
    console.error(`[${requestId}] Error details: ${error instanceof Error ? error.message : String(error)}`)
    throw error
  }
})

// ─── Phase 14: Build TopicContext from DB records ──────────

async function buildTopicContext(
  topicSelectionId: string,
  openingTypeCode: string,
  copyStructureCode: string,
  endingTypeCode: string,
  userId: string,
): Promise<TopicContext> {
  // Fetch all required records in parallel
  const [topicSelection, openingType, copyStructure, endingType] = await Promise.all([
    prisma.topicSelection.findUnique({
      where: { id: topicSelectionId, userId },
    }),
    prisma.openingType.findUnique({
      where: { code: openingTypeCode, status: "published" },
      select: { code: true, name: true, formulas: true },
    }) as Promise<OpeningTypeRecord | null>,
    prisma.copyStructure.findUnique({
      where: { code: copyStructureCode, status: "published" },
      select: { code: true, name: true, beats: true },
    }) as Promise<CopyStructureRecord | null>,
    prisma.endingType.findUnique({
      where: { code: endingTypeCode, status: "published" },
      select: { code: true, name: true, guidance: true, patterns: true },
    }) as Promise<EndingTypeRecord | null>,
  ])

  if (!topicSelection) {
    throw new Error(`TopicSelection not found: ${topicSelectionId}`)
  }
  if (!openingType) {
    throw new Error(`OpeningType not found: ${openingTypeCode}`)
  }
  if (!copyStructure) {
    throw new Error(`CopyStructure not found: ${copyStructureCode}`)
  }
  if (!endingType) {
    throw new Error(`EndingType not found: ${endingTypeCode}`)
  }

  // Extract topic title from the selected candidate
  const candidates = topicSelection.candidates as unknown as Array<{ title?: string; elementCodes?: string[] }>
  const selectedIndex = topicSelection.selectedIndex ?? 0
  const selectedCard = candidates[selectedIndex] ?? candidates[0]
  const topicTitle = selectedCard?.title ?? "未命名选题"
  const elementTags = Array.isArray(topicSelection.elementCodes)
    ? (topicSelection.elementCodes as string[])
    : (selectedCard?.elementCodes ?? [])

  // Parse JSON fields
  const formulas = Array.isArray(openingType.formulas)
    ? (openingType.formulas as string[])
    : []
  const beats = Array.isArray(copyStructure.beats)
    ? (copyStructure.beats as CopyBeat[])
    : []
  const patterns = Array.isArray(endingType.patterns)
    ? (endingType.patterns as string[])
    : []

  return {
    topicSelectionId,
    topicTitle,
    elementTags,
    openingTypeCode: openingType.code,
    openingTypeName: openingType.name,
    openingFormulas: formulas,
    copyStructureCode: copyStructure.code,
    copyStructureName: copyStructure.name,
    copyStructureBeats: beats,
    endingTypeCode: endingType.code,
    endingTypeName: endingType.name,
    endingGuidance: endingType.guidance,
    endingPatterns: patterns,
  }
}
