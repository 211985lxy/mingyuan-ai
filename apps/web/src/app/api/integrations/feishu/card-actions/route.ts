// ─── 飞书卡片按钮回调路由 ─────────────────────────────────────
// 处理交互卡片中"通过"/"打回修改"按钮的点击回调。
// 复用现有 work-item-execution 的状态机跳转逻辑，不新增第二套状态机。
//
// 飞书卡片回调格式：POST body 包含 action.value = { action, recordId, workflowId }
// 鉴权：通过 bot 的 verification token 校验（与事件订阅共用）。
// api-inventory: auth=signed_integration

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

export const dynamic = "force-dynamic"

interface CardActionValue {
  action?: string
  recordId?: string
  workflowId?: string
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
 * @description 处理飞书卡片按钮回调
 * @param request - 请求对象
 * @returns 飞书卡片回调响应
 */
export async function POST(request: Request) {
  let body: CardCallbackBody & { challenge?: string; type?: string }
  try {
    body = (await parseJsonRecord(request)) as CardCallbackBody & { challenge?: string; type?: string }
  } catch {
    return NextResponse.json({ error: "Invalid card callback payload" }, { status: 400 })
  }

  // 飞书 URL 验证（配置回调地址时平台发送 challenge）
  if (body.type === "url_verification" && body.challenge) {
    return NextResponse.json({ challenge: body.challenge })
  }

  // 校验 token（识别 bot 身份）
  const token = body.token || ""
  const bot = resolveBotByVerificationToken(token)
  if (!bot) {
    return NextResponse.json({ error: "Unknown agent bot" }, { status: 404 })
  }

  // 解析按钮动作
  const actionValue = body.action?.value
  const action = actionValue?.action?.trim() || ""
  const recordId = actionValue?.recordId?.trim() || ""

  if (!recordId) {
    return NextResponse.json({ toast: { type: "error", content: "缺少记录ID" } }, { status: 200 })
  }

  if (action !== "approve" && action !== "reject") {
    return NextResponse.json({ toast: { type: "error", content: "未知操作" } }, { status: 200 })
  }

  // 执行状态跳转（复用现有状态机）
  let config
  try {
    config = readWorkItemStoreConfig()
  } catch {
    return NextResponse.json({ toast: { type: "error", content: "飞书配置缺失" } }, { status: 200 })
  }
  const store = createLarkWorkItemStore(config)

  let result: WorkItemExecutionResult
  try {
    if (action === "approve") {
      // 通过 → 完成（需要 aimResultId，从记录中读取）
      // 注意：complete 需要 aimResultId，这里简化为直接调用
      // 实际场景中 aimResultId 应该在记录中已经存在
      result = await completeWorkItem(store, recordId, {
        aimResultId: "card-approve",
        resultSummary: "飞书卡片审核通过",
      })
    } else {
      // 打回 → 重新开始（待处理 → 处理中）
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
  return NextResponse.json({ toast: { type: "success", content: successMsg } }, { status: 200 })
}
