import { apiRequestErrorResponse, parseJsonBody } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"

import {
  agentAuthErrorResponse,
  assertAgentProjectAccess,
  assertAgentScope,
  authenticateAgentRequest,
  type AgentApiContext,
} from "@/lib/agent-api-auth"
import { ensureKnowledgeEmbedding } from "@/lib/llm/embeddings"
import { prisma } from "@/lib/prisma"
import { enforceKnowledgeBetaLimit } from "@/lib/internal-beta-limits"
import { AGENT_SCOPE } from "@/lib/aim-remote/contracts"
import { agentWechatConfirmBodySchema } from "@/features/aim/contracts/agent-api"

const ALLOWED_CATEGORIES = new Set([
  "boss_experience",
  "product_usp",
  "customer_pain",
  "project_case",
  "customer_qa",
  "daily_inspiration",
  "benchmark_reference",
  "user_insight",
  "hot_topic",
  "positioning_material",
  "private_domain_material",
  "writing_style_profile",
])
const ALLOWED_VALUE_GRADES = new Set(["S", "A", "B", "C"])
const MAX_ENTRIES_PER_CONFIRM = 50
const MAX_TAGS_PER_ENTRY = 20

function validateEntry(entry: unknown): string | null {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return "知识条目格式错误"
  const value = entry as Partial<ConfirmedEntry>
  if (value.skip) return null
  if (typeof value.title !== "string" || !value.title.trim() || value.title.length > 200) {
    return "知识标题不能为空且不能超过 200 字"
  }
  if (typeof value.content !== "string" || !value.content.trim() || value.content.length > 50_000) {
    return "知识正文不能为空且不能超过 50000 字"
  }
  if (typeof value.category !== "string" || !ALLOWED_CATEGORIES.has(value.category)) {
    return "知识分类不合法"
  }
  if (!Array.isArray(value.tags) || value.tags.length > MAX_TAGS_PER_ENTRY || value.tags.some((tag) => typeof tag !== "string" || !tag.trim() || tag.length > 80)) {
    return `标签必须是最多 ${MAX_TAGS_PER_ENTRY} 个、每个不超过 80 字的字符串`
  }
  if (value.valueGrade && !ALLOWED_VALUE_GRADES.has(value.valueGrade)) {
    return "价值分级只支持 S、A、B、C"
  }
  return null
}

interface ConfirmedEntry {
  title: string
  content: string
  category: string
  tags: string[]
  valueGrade?: string
  skip?: boolean
}

async function writeAgentLog(params: {
  context: AgentApiContext
  projectId?: string
  inputSummary?: string
  status: "success" | "failed"
  errorMessage?: string
  durationMs?: number
}) {
  await prisma.agentApiCallLog.create({
    data: {
      apiKeyId: params.context.apiKeyId,
      userId: params.context.userId,
      projectId: params.projectId || null,
      action: "knowledge.wechat_chat.import.confirm",
      inputSummary: params.inputSummary || null,
      outputFormats: [],
      status: params.status,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
    },
  })
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  let context: AgentApiContext | null = null
  let projectId = ""
  let entries: ConfirmedEntry[] = []
  const startedAt = Date.now()

  try {
    context = await authenticateAgentRequest(request)
    assertAgentScope(context, AGENT_SCOPE.knowledgeConfirm)
    const body = await parseJsonBody(request, agentWechatConfirmBodySchema, { maxBytes: 3 * 1024 * 1024 })

    projectId = typeof body.projectId === "string" ? body.projectId.trim() : ""
    entries = Array.isArray(body.entries) ? body.entries : []

    if (!projectId) {
      throw new Error("请选择 IP 营销全案")
    }
    if (entries.length === 0) {
      throw new Error("请提供确认后的知识条目")
    }
    if (entries.length > MAX_ENTRIES_PER_CONFIRM) {
      throw new Error(`单次最多确认 ${MAX_ENTRIES_PER_CONFIRM} 条知识`)
    }

    await assertAgentProjectAccess(context, projectId)

    const toCreate = entries.filter((entry) => !entry.skip)
    if (toCreate.length === 0) {
      return NextResponse.json({ data: { created: 0 } })
    }

    const validationError = toCreate.map(validateEntry).find(Boolean)
    if (validationError) throw new Error(validationError)

    const limitResponse = await enforceKnowledgeBetaLimit({
      userId: context.userId,
      projectId,
      incoming: toCreate.length,
    })
    if (limitResponse) return limitResponse

    const created = await prisma.$transaction(
      toCreate.map((entry) =>
        prisma.knowledgeEntry.create({
          data: {
            userId: context!.userId,
            projectId,
            category: entry.category,
            title: entry.title.trim(),
            content: entry.content.trim(),
            tags: entry.tags.map((tag) => tag.trim()),
            sourceType: "smart_import",
            valueGrade: entry.valueGrade || null,
            status: "active",
          },
        }),
      ),
    )

    for (const entry of created) {
      ensureKnowledgeEmbedding(entry.id).catch(() => {})
    }

    await prisma.agentApiKey.update({
      where: { id: context.apiKeyId },
      data: { lastUsedAt: new Date() },
    })

    await writeAgentLog({
      context,
      projectId,
      inputSummary: `${toCreate.length} entries`,
      status: "success",
      durationMs: Date.now() - startedAt,
    })

    return NextResponse.json({
      data: { created: created.length },
      warnings: ["knowledge_mutation_completed"],
    })
  } catch (error) {
    if (context) {
      await writeAgentLog({
        context,
        projectId,
        inputSummary: `${entries.length} entries`,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : "导入确认失败",
        durationMs: Date.now() - startedAt,
      })
    }

    console.error("[agent/knowledge/wechat-chat/confirm] Error:", error)
    const authResponse = agentAuthErrorResponse(error)
    if (authResponse) return authResponse
    const contractResponse = apiRequestErrorResponse(request, error)
    if (contractResponse) return contractResponse

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "导入确认失败" },
      { status: 400 },
    )
  }
}
