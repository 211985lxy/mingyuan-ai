import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

/**
 * 把生成结果写回消息列表。若占位气泡已被路由预填等逻辑清掉，
 * 则重新插入一条，避免接口已成功但中间空白。
 */
export function mergeAimGenerationIntoMessages(
  messages: AimWorkbenchMessage[],
  assistantMessageId: string,
  patch: Omit<AimWorkbenchMessage, "id" | "role"> & { role?: "assistant" },
): AimWorkbenchMessage[] {
  const next: AimWorkbenchMessage = {
    id: assistantMessageId,
    role: "assistant",
    content: patch.content,
    agentId: patch.agentId,
    deliverables: patch.deliverables,
    runId: patch.runId ?? null,
    degraded: patch.degraded ?? null,
    qualityStatus: patch.qualityStatus ?? null,
    workflowStage: patch.workflowStage,
    contentAction: patch.contentAction,
    regenerating: patch.regenerating ?? false,
    pendingGeneration: patch.pendingGeneration ?? false,
    failure: patch.failure ?? null,
    traceId: patch.traceId,
    traceType: patch.traceType,
  }
  if (!messages.some((message) => message.id === assistantMessageId)) {
    return [...messages, next]
  }
  return messages.map((message) => (message.id === assistantMessageId ? { ...message, ...next } : message))
}
