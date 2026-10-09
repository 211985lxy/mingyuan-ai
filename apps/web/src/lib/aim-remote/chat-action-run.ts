/**
 * 用钥匙上的用户身份，走网页输入框的发送。
 * 写飞书、改知识库、改营销全案直接拒绝，不往下执行。
 */

import { detectAimLarkToolAction } from "@/lib/aim/workbench-helpers"
import { failAimTrace } from "@/lib/aim-observability"
import { mapAimErrorToUserMessage } from "@/lib/aim-error-message"
import { enforceDailyBetaLimit } from "@/lib/internal-beta-limits"
import { runSignedInAimChat, type SignedInChatState } from "@/lib/aim/services/signed-in-chat"
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import { PAGE_ACTION_REFUSALS } from "./page-action-catalog"

export async function runAimChatJob(
  userId: string,
  agentId: AimAgentId,
  message: string,
  draft?: string,
) {
  const refusal = refusalForChat(message)
  if (refusal) return { ok: false as const, code: "FORBIDDEN", message: refusal }
  const quota = await enforceDailyBetaLimit(userId, "aim_chat")
  if (quota) return quotaFailure(quota)
  const state: SignedInChatState = {}
  try {
    const response = await runSignedInAimChat({ userId, body: chatBody(agentId, message, draft), state })
    return readChatResponse(response)
  } catch (error) {
    if (state.trace) await failAimTrace(state.trace, error)
    return {
      ok: false as const,
      code: "CHAT_FAILED",
      message: mapAimErrorToUserMessage(error, "对话失败，请稍后重试"),
    }
  }
}

export function refusalForChat(message: string) {
  if (detectAimLarkToolAction(message)) return PAGE_ACTION_REFUSALS.feishu_write
  if (/确认应用|写入画像|写入老板说明书|修改 IP 营销全案/.test(message)) return PAGE_ACTION_REFUSALS.ip_plan_edit
  if (/保存为档案素材|保存为 AIM 档案素材|沉淀到知识库|修改知识库|写入知识库/.test(message)) {
    return PAGE_ACTION_REFUSALS.knowledge_edit
  }
  return null
}

export function emptyChatMessage() {
  return "还没有要说的话。页面也不会空着发送。请把问题写上；问「这篇」时把成稿放在 draft。"
}

function chatBody(agentId: string, message: string, draft?: string) {
  const text = draft?.trim()
  return {
    messages: [{ role: "user", content: message.trim() }],
    agentId,
    stream: false,
    ...(text ? {
      editorContext: {
        action: "用户追问",
        draftText: text,
        documentType: "copy" as const,
        draftLabel: "成稿",
      },
    } : {}),
  }
}

async function readChatResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as { error?: string; content?: string; code?: string }
  if (response.status !== 200) {
    return {
      ok: false as const,
      code: String(payload.code || "CHAT_FAILED"),
      message: payload.error || "页面没有完成这次对话。",
    }
  }
  const text = String(payload.content ?? "").trim()
  if (!text) return { ok: false as const, code: "EMPTY_RESULT", message: "跑完了，但没有回复。空结果不算成功。" }
  return { ok: true as const, text }
}

async function quotaFailure(quota: Response) {
  const payload = await quota.clone().json().catch(() => ({})) as { error?: string }
  return { ok: false as const, code: "QUOTA", message: payload.error || "今天的对话次数用完了。" }
}
