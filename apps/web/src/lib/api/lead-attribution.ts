"use client"

import { request } from "@/lib/api/core"

/** 线索快登输入：来源内容 + 外部线索标识（微信号/手机号/线索编号）。 */
export interface AimLeadAttributionInput {
  generationId: string
  externalLeadId: string
  externalDealId?: string
  externalPaymentId?: string
}

/** 与服务端 POST /api/aim/lead-attributions 响应结构保持一致。 */
export interface AimLeadAttributionResult {
  created: boolean
  record: {
    id: string
    attributionMethod: string
    attributionConfidence: string
  }
}

/**
 * @description 登记线索归因：把线索显式挂到指定内容（explicit/high）
 */
export async function registerAimLeadAttribution(input: AimLeadAttributionInput): Promise<AimLeadAttributionResult> {
  return request<AimLeadAttributionResult>("/api/aim/lead-attributions", {
    method: "POST",
    body: JSON.stringify(input),
  })
}
