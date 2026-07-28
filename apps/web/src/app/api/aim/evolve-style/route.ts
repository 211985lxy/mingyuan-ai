import { parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import {
  extractStyleProfileDelta,
  extractStyleProfileFromSamples,
  normalizeStyleMessages,
  upsertMainStyleProfile,
  type StyleProfileDelta,
  type StyleSampleInput,
} from "@/lib/aim-style-evolution"
import { ownsActiveProject } from "@/lib/resource-ownership"
import { aimEvolveStyleBodySchema } from "@/features/aim/contracts/api"

// 提取 + 合并两次 LLM 调用，给足时间
export const maxDuration = 60

function resolveProjectId(raw: string | undefined): string {
  return typeof raw === "string" ? raw.trim() : ""
}

/**
 * @description 处理 POST 请求：旧路径直写 / preview 只预览 / commit 确认写入
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, aimEvolveStyleBodySchema, { maxBytes: 512 * 1024 })
    const projectId = resolveProjectId(body.projectId)

    if (projectId && !(await ownsActiveProject(user.id, projectId))) {
      return NextResponse.json({ error: "IP 营销全案不存在或已归档" }, { status: 404 })
    }

    const operation = body.operation

    if (operation === "preview") {
      return handlePreview(body)
    }

    if (operation === "commit") {
      return handleCommit(user.id, body.delta!, projectId)
    }

    // ── 旧调用兼容：messages → 提取 + 写库 ──
    const messages = normalizeStyleMessages(body.messages)
    if (messages.length < 2) {
      return NextResponse.json({ delta: null, profile: null, reason: "对话太少" })
    }

    const delta = await extractStyleProfileDelta({ messages })
    if (!delta) {
      return NextResponse.json({ delta: null, profile: null, reason: "no_style" })
    }

    const stamp = new Date().toISOString().slice(0, 10)
    const result = await upsertMainStyleProfile({
      userId: user.id,
      delta,
      stamp,
      projectId: projectId || null,
    })

    return NextResponse.json({
      delta: { evidence: delta.evidence, confidence: delta.confidence },
      profile: { id: result.id, title: result.title },
      created: result.created,
    })
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    console.error("[aim/evolve-style] Error:", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "写作风格提炼失败" },
      { status: 500 },
    )
  }
}

async function handlePreview(body: {
  samples?: StyleSampleInput[]
  messages?: unknown
}) {
  let delta: StyleProfileDelta | null = null

  if (body.samples && body.samples.length > 0) {
    const samples = body.samples
      .map((s) => ({ content: s.content.trim(), label: s.label }))
      .filter((s) => s.content.length > 0)
    if (samples.length === 0) {
      return NextResponse.json(
        { error: "风格样本不能为空，请粘贴至少一篇有效文案" },
        { status: 400 },
      )
    }
    if (samples.length > 10) {
      return NextResponse.json(
        { error: "一次最多分析 10 篇样本，请删减后再试" },
        { status: 400 },
      )
    }
    delta = await extractStyleProfileFromSamples({ samples })
  } else {
    const messages = normalizeStyleMessages(body.messages)
    if (messages.length < 1) {
      return NextResponse.json(
        { error: "风格预览需要样本或对话消息" },
        { status: 400 },
      )
    }
    delta = await extractStyleProfileDelta({ messages })
  }

  if (!delta) {
    return NextResponse.json({ delta: null, profile: null, reason: "no_style" })
  }

  // 预览：返回完整八维候选，绝不写库
  return NextResponse.json({
    delta,
    profile: null,
    created: false,
    preview: true,
  })
}

async function handleCommit(
  userId: string,
  delta: StyleProfileDelta,
  projectId: string,
) {
  const stamp = new Date().toISOString().slice(0, 10)
  const result = await upsertMainStyleProfile({
    userId,
    delta,
    stamp,
    projectId: projectId || null,
  })

  return NextResponse.json({
    delta: {
      evidence: delta.evidence,
      confidence: delta.confidence,
      cognitivePattern: delta.cognitivePattern,
      emotionalTexture: delta.emotionalTexture,
      structuralDna: delta.structuralDna,
      microLinguistics: delta.microLinguistics,
      coreValues: delta.coreValues,
      decisionHeuristics: delta.decisionHeuristics,
      antiPatterns: delta.antiPatterns,
      honestLimits: delta.honestLimits,
    },
    profile: { id: result.id, title: result.title },
    created: result.created,
    preview: false,
  })
}
