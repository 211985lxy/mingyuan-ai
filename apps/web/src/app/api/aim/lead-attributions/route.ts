import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { prisma } from "@/lib/prisma"
import {
  AttributionConflictError,
  upsertOutcomeAttribution,
} from "@/lib/aim/outcome-attribution"
import { createPrismaOutcomeAttributionStore } from "@/lib/aim/outcome-attribution-prisma"

export const dynamic = "force-dynamic"

/**
 * 线索快登（WP-B 强制点②）。
 *
 * 用户在内容卡片上把新线索显式挂到该内容：explicitLink=true → explicit/high。
 * 不建 Lead/Deal CRM 实体，只存外部 ID 投影；同线索重复登记走幂等合并，
 * 绑定冲突返回 409 原文案，绝不静默改写。
 */

function readOptionalId(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const generationId = typeof body.generationId === "string" ? body.generationId.trim() : ""
    const externalLeadId = typeof body.externalLeadId === "string" ? body.externalLeadId.trim() : ""
    if (!generationId) {
      return NextResponse.json({ error: "缺少来源内容" }, { status: 400 })
    }
    if (!externalLeadId) {
      return NextResponse.json({ error: "请填写线索标识（微信号 / 手机号 / 线索编号）" }, { status: 400 })
    }
    const generation = await prisma.aimGeneration.findFirst({
      where: { id: generationId, userId: user.id },
      select: { id: true },
    })
    if (!generation) {
      return NextResponse.json({ error: "来源内容不存在" }, { status: 404 })
    }
    try {
      const { record, created } = await upsertOutcomeAttribution({
        userId: user.id,
        generationId,
        externalLeadId,
        externalDealId: readOptionalId(body.externalDealId),
        externalPaymentId: readOptionalId(body.externalPaymentId),
        externalAttributionConfirmer: "网页快登",
        explicitLink: true,
        occurredAt: new Date(),
      }, createPrismaOutcomeAttributionStore())
      return NextResponse.json({ record, created }, { status: created ? 201 : 200 })
    } catch (error) {
      if (error instanceof AttributionConflictError) {
        return NextResponse.json({ error: error.message }, { status: 409 })
      }
      throw error
    }
  } catch (error) {
    return authErrorResponse(error) ?? apiRequestErrorResponse(request, error) ?? NextResponse.json(
      { error: "线索归因登记失败" },
      { status: 500 }
    )
  }
}
