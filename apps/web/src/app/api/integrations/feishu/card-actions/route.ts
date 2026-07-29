// ─── 飞书卡片按钮回调路由 ─────────────────────────────────────
// 处理交互卡片中"通过"/"打回修改"按钮的点击回调。
// 复用现有 work-item-execution 的状态机跳转逻辑，不新增第二套状态机。
//
// 飞书卡片回调格式：POST body 包含 action.value = { action, recordId, workflowId }
// 鉴权：通过 bot 的 verification token 校验（与事件订阅共用）。
// api-inventory: auth=signed_integration
//
// WP-2：审批必须写入真实 open_id/user_id；禁止硬编码审批结果 ID。
// 失败可重试；重放不重复完成（见 approval-completion）。

import { NextResponse } from "next/server"
import { parseJsonRecord } from "@/lib/api-contract"
import { resolveBotByVerificationToken } from "@/lib/feishu-agent-registry"
import {
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import { processFeishuCardApproval } from "@/lib/aim/approval-completion"
import {
  createPrismaApprovalDecisionStore,
  listActiveGovernanceAssignments,
} from "@/lib/aim/approval-decision-prisma"

export const dynamic = "force-dynamic"

interface CardActionValue {
  action?: string
  recordId?: string
  workflowId?: string
  projectId?: string
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

function toastError(content: string, extra?: Record<string, unknown>) {
  return NextResponse.json({ toast: { type: "error", content }, ...extra }, { status: 200 })
}

async function resolveAimResultId(
  actionValue: CardActionValue | undefined,
  getRecord: (recordId: string) => Promise<{ fields: Record<string, unknown> } | null>,
  recordId: string,
): Promise<string> {
  const fromAction = actionValue?.aimResultId?.trim() || ""
  if (fromAction) return fromAction
  try {
    const record = await getRecord(recordId)
    const fields = record?.fields ?? {}
    const raw = fields["AIM结果ID"] ?? fields["aimResultId"] ?? fields["AIM生成ID"]
    return typeof raw === "string" ? raw.trim() : ""
  } catch {
    return ""
  }
}

/**
 * @description 处理飞书卡片按钮回调；签字写入真实操作人身份
 */
export async function POST(request: Request) {
  let body: CardCallbackBody & { challenge?: string; type?: string }
  try {
    body = (await parseJsonRecord(request)) as CardCallbackBody & {
      challenge?: string
      type?: string
    }
  } catch {
    return NextResponse.json({ error: "Invalid card callback payload" }, { status: 400 })
  }

  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  const bot = resolveBotByVerificationToken(body.token || "")
  if (!bot) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  const actionValue = body.action?.value
  const action = actionValue?.action?.trim() || ""
  const recordId = actionValue?.recordId?.trim() || ""
  const workflowId = actionValue?.workflowId?.trim() || ""
  const projectId = actionValue?.projectId?.trim() || null
  const openId = typeof body.open_id === "string" ? body.open_id.trim() : ""
  const userId = typeof body.user_id === "string" ? body.user_id.trim() : ""
  const messageId =
    typeof body.open_message_id === "string" ? body.open_message_id.trim() : ""

  if (!recordId) return toastError("缺少记录ID")
  if (!workflowId) return toastError("缺少工作流ID")
  if (!messageId) return toastError("缺少 open_message_id，拒绝创建共享幂等键")
  if (action !== "approve" && action !== "reject") return toastError("未知操作")
  if (!openId && !userId) return toastError("缺少审批人 open_id/user_id，拒绝匿名签字")

  let config
  try {
    config = readWorkItemStoreConfig()
  } catch {
    return toastError("飞书配置缺失")
  }
  const workItemStore = createLarkWorkItemStore(config)
  const aimResultId = await resolveAimResultId(actionValue, (id) => workItemStore.get(id), recordId)
  const assignments = await listActiveGovernanceAssignments(workflowId)
  const result = await processFeishuCardApproval({
    assignments,
    workflowId,
    projectId,
    recordId,
    action,
    openId,
    externalUserId: userId,
    messageId,
    aimResultId,
    workItemStore,
    approvalStore: createPrismaApprovalDecisionStore(),
  })

  if (!result.ok) {
    return toastError(result.error, {
      approvalId: result.approval?.id,
      recoverable: result.recoverable === true,
    })
  }

  return NextResponse.json(
    {
      toast: {
        type: result.idempotent || result.processing ? "info" : "success",
        content: result.toast,
      },
      approvalId: result.approval.id,
      idempotent: result.idempotent,
    },
    { status: 200 },
  )
}
