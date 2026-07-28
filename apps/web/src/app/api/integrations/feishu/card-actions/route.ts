// ─── 飞书卡片按钮回调路由 ─────────────────────────────────────
// 处理交互卡片中"通过"/"打回修改"按钮的点击回调。
// 复用现有 work-item-execution 的状态机跳转逻辑，不新增第二套状态机。
//
// 飞书卡片回调格式：POST body 包含 action.value = { action, recordId, workflowId }
// 鉴权：通过 bot 的 verification token 校验（与事件订阅共用）。
// api-inventory: auth=signed_integration
//
// WP-2：审批必须写入真实 open_id/user_id；禁止硬编码审批结果 ID。

import { NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { resolveBotByVerificationToken } from "@/lib/feishu-agent-registry"
import {
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import {
  completeWorkItem,
  startWorkItem,
  type WorkItemExecutionResult,
} from "@/lib/aim/services/work-item-execution"
import {
  assertReviewerMatchesAssignment,
  assertWorkflowGovernanceReady,
} from "@/lib/aim/workflow-governance"
import { recordApprovalDecision } from "@/lib/aim/approval-decision-store"
import {
  createPrismaApprovalDecisionStore,
  listActiveGovernanceAssignments,
} from "@/lib/aim/approval-decision-prisma"

export const dynamic = "force-dynamic"

interface CardActionValue {
  action?: string
  recordId?: string
  workflowId?: string
  aimResultId?: string
}

interface CardCallbackBody {
  open_id?: string
  user_id?: string
  open_message_id?: string
  open_chat_id?: string
  tenant_key?: string
  token?: string
  action?: {
    value?: CardActionValue
    tag?: string
  }
}

/**
 * @description 处理飞书卡片按钮回调；签字写入真实操作人身份
 */
export async function POST(request: Request) {
  let body: CardCallbackBody & { challenge?: string; type?: string }
  try {
    body = (await parseJsonRecord(request)) as CardCallbackBody & { challenge?: string; type?: string }
  } catch {
    return NextResponse.json({ error: "Invalid card callback payload" }, { status: 400 })
  }

  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  const token = body.token || ""
  const bot = resolveBotByVerificationToken(token)
  if (!bot) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  const actionValue = body.action?.value
  const action = actionValue?.action?.trim() || ""
  const recordId = actionValue?.recordId?.trim() || ""
  const workflowId = actionValue?.workflowId?.trim() || "default"
  const openId = typeof body.open_id === "string" ? body.open_id.trim() : ""
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : ""

  if (!recordId) {
    return NextResponse.json({ toast: { type: "error", content: "缺少记录ID" } }, { status: 200 })
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ toast: { type: "error", content: "未知操作" } }, { status: 200 })
  }

  if (!openId && !userId) {
    return NextResponse.json(
      { toast: { type: "error", content: "缺少审批人 open_id/user_id，拒绝匿名签字" } },
      { status: 200 },
    )
  }

  let config
  try {
    config = readWorkItemStoreConfig()
  } catch {
    return NextResponse.json({ toast: { type: "error", content: "飞书配置缺失" } }, { status: 200 })
  }
  const store = createLarkWorkItemStore(config)

  // 读取真实 AIM 结果 ID，禁止硬编码 card-approve
  let aimResultId = actionValue?.aimResultId?.trim() || ""
  if (!aimResultId) {
    try {
      const record = await store.get(recordId)
      const fields = record?.fields ?? {}
      const raw =
        fields["AIM结果ID"]
        ?? fields["aimResultId"]
        ?? fields["AIM生成ID"]
      aimResultId = typeof raw === "string" ? raw.trim() : ""
    } catch {
      aimResultId = ""
    }
  }

  const assignments = await listActiveGovernanceAssignments(workflowId)
  const ready = assertWorkflowGovernanceReady(assignments, { workflowId })
  if (!ready.ok) {
    return NextResponse.json({ toast: { type: "error", content: ready.error } }, { status: 200 })
  }

  const match = assertReviewerMatchesAssignment(assignments, {
    workflowId,
    reviewerUserId: userId || null,
    externalReviewerId: openId || null,
  })
  if (!match.ok) {
    return NextResponse.json({ toast: { type: "error", content: match.error } }, { status: 200 })
  }

  const messageId = body.open_message_id?.trim() || "unknown_msg"
  const requestId = `feishu_card:${messageId}:${action}:${recordId}`
  const approvalStore = createPrismaApprovalDecisionStore()
  const { record: approval, idempotent } = await recordApprovalDecision(approvalStore, {
    subjectType: "work_item",
    subjectId: recordId,
    decision: action === "approve" ? "approve" : "reject",
    reviewerUserId: userId || null,
    externalReviewerId: openId || null,
    roleSnapshot: match.role,
    reason: action === "approve" ? "飞书卡片审核通过" : "飞书卡片打回修改",
    source: "feishu_card",
    requestId,
  })

  // 重放卡片：已有签字则不重复推进状态机
  if (idempotent) {
    return NextResponse.json(
      {
        toast: {
          type: "info",
          content: action === "approve" ? "已通过（幂等）" : "已打回（幂等）",
        },
        approvalId: approval.id,
        idempotent: true,
      },
      { status: 200 },
    )
  }

  let result: WorkItemExecutionResult
  try {
    if (action === "approve") {
      if (!aimResultId) {
        return NextResponse.json(
          { toast: { type: "error", content: "记录缺少 AIM结果ID，禁止无结果完成" } },
          { status: 200 },
        )
      }
      result = await completeWorkItem(store, recordId, {
        aimResultId,
        resultSummary: `飞书卡片审核通过；approvalId=${approval.id}`,
      })
    } else {
      result = await startWorkItem(store, recordId)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "操作失败"
    return NextResponse.json({ toast: { type: "error", content: message } }, { status: 200 })
  }

  if (!result.ok) {
    return NextResponse.json({ toast: { type: "error", content: result.error } }, { status: 200 })
  }

  const successMsg = action === "approve" ? "已通过审核" : "已打回重新处理"
  return NextResponse.json(
    { toast: { type: "success", content: successMsg }, approvalId: approval.id },
    { status: 200 },
  )
}
