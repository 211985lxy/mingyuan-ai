// ─── 飞书 HITL 审批卡片回调路由 ─────────────────────────────────
// 处理 HITL 审批交互卡片「批准/驳回」按钮的点击回调。
// 决策按卡片带回的原 requestId（控制台用户维度）落审批记录，
// 与控制台对话内审批共享同一门禁判定（evaluateHitlGate 按 subject 前缀扫描）。
//
// 鉴权：bot verification token（与 card-actions 同一机制）。
// api-inventory: auth=signed_integration

import { NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { resolveBotByVerificationToken } from "@/lib/feishu-agent-registry"
import { ApprovalIdempotencyConflictError } from "@/lib/aim/approval-decision-store"
import {
  settleHitlApprovalForCard,
  type HitlDecisionCode,
} from "@/lib/aim/hitl-gate"
import { createPrismaApprovalDecisionStore } from "@/lib/aim/approval-decision-prisma"

export const dynamic = "force-dynamic"

interface HitlCardActionValue {
  hitl_action?: string
  hitl_request_id?: string
}

interface HitlCardCallbackBody {
  open_id?: string
  user_id?: string
  open_message_id?: string
  token?: string
  type?: string
  challenge?: string
  action?: {
    value?: HitlCardActionValue
    tag?: string
  }
}

function toast(content: string, type: "success" | "error" = "success", extra?: Record<string, unknown>) {
  return NextResponse.json({ toast: { type, content }, ...extra }, { status: 200 })
}

export async function POST(request: Request) {
  let body: HitlCardCallbackBody | null
  try {
    // 飞书卡片回调 body 结构动态（action.value 自由键），不能用严格 zod 收口
    body = (await parseJsonRecord(request)) as unknown as HitlCardCallbackBody | null
  } catch {
    return toast("请求体不可解析", "error")
  }
  if (!body) return toast("请求体不可解析", "error")

  // 飞书卡片回调的 URL 校验挑战原样返回
  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  const bot = resolveBotByVerificationToken(typeof body.token === "string" ? body.token : "")
  if (!bot) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  const actionValue = body.action?.value
  const action = actionValue?.hitl_action?.trim() || ""
  const requestId = actionValue?.hitl_request_id?.trim() || ""
  const reviewerId =
    (typeof body.open_id === "string" && body.open_id.trim()) ||
    (typeof body.user_id === "string" && body.user_id.trim()) ||
    ""

  if (!requestId) return toast("缺少审批请求 ID", "error")
  if (action !== "approve" && action !== "reject") return toast("未知操作", "error")
  if (!reviewerId) return toast("缺少审批人身份，拒绝匿名签字", "error")

  try {
    const result = await settleHitlApprovalForCard(
      {
        requestId,
        reviewerId,
        decision: action as HitlDecisionCode,
      },
      createPrismaApprovalDecisionStore(),
    )

    return toast(
      result.proceed ? "已批准，操作开始执行" : "已驳回，操作不会执行",
      "success",
      { approvalId: result.record.id },
    )
  } catch (error) {
    if (error instanceof ApprovalIdempotencyConflictError) {
      return toast("该审批已存在不同决策记录，请到控制台查看", "error")
    }
    console.error("[feishu-hitl-card-actions] 结算失败:", error instanceof Error ? error.message : error)
    return toast("审批结算失败，请稍后重试", "error")
  }
}
