import { z } from "zod"
import { NextRequest, NextResponse } from "next/server"
import { parseJsonBody } from "@/lib/api-contract"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { resolveTurnIntentWithVectorFallback } from "@/lib/aim-intent-vector"
import type { AimArchiveGapInput } from "@/lib/aim-turn-intent"

const intentResolveBodySchema = z.object({
  rawInput: z.string().trim().min(1).max(8_000),
  targetFormats: z.array(z.string().max(40)).max(8).optional(),
  projectId: z.string().trim().min(1).max(80).optional(),
  archive: z.object({
    hasProject: z.boolean().optional(),
    knowledgeCount: z.number().int().min(0).max(10_000).optional(),
    knownFactCount: z.number().int().min(0).max(10_000).optional(),
    hasOfferSignal: z.boolean().optional(),
    hasCaseSignal: z.boolean().optional(),
    unknowns: z.array(z.string().max(300)).max(8).optional(),
  }).strict().optional(),
}).strict()

async function enrichArchiveFromProject(
  userId: string,
  projectId: string | undefined,
  archive?: AimArchiveGapInput,
): Promise<AimArchiveGapInput> {
  const base: AimArchiveGapInput = {
    ...archive,
    hasProject: archive?.hasProject ?? Boolean(projectId),
  }
  if (!projectId) return base

  const [knowledgeCount, offerCount, caseCount] = await Promise.all([
    prisma.knowledgeEntry.count({
      where: { userId, projectId, status: "active" },
    }),
    prisma.knowledgeEntry.count({
      where: { userId, projectId, status: "active", category: "product_usp" },
    }),
    prisma.knowledgeEntry.count({
      where: { userId, projectId, status: "active", category: "project_case" },
    }),
  ])

  return {
    ...base,
    hasProject: true,
    knowledgeCount: archive?.knowledgeCount ?? knowledgeCount,
    hasOfferSignal: archive?.hasOfferSignal ?? offerCount > 0,
    hasCaseSignal: archive?.hasCaseSignal ?? caseCount > 0,
  }
}

/**
 * 规则意图 +（低置信且显式开启时）向量兜底。仅用于生成前确认；生成时不再调用。
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonBody(request, intentResolveBodySchema, { maxBytes: 32 * 1024 })
    const archive = await enrichArchiveFromProject(user.id, body.projectId, body.archive)
    const result = await resolveTurnIntentWithVectorFallback({
      rawInput: body.rawInput,
      targetFormats: body.targetFormats as import("@/lib/aim-generator").ContentFormat[] | undefined,
      archive,
    })
    return NextResponse.json(result)
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    const message = error instanceof Error ? error.message : "意图解析失败"
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
