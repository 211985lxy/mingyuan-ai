import { mapAimGenerationToDeliverables } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimGeneration } from "@/lib/api/client"

export function buildAimHistoryLoadMessages(item: AimGeneration, assistantId: string) {
  const deliverables = mapAimGenerationToDeliverables(item)
  const contents = deliverables.results
  const newsroom = item.taskSpec && typeof item.taskSpec === "object" && !Array.isArray(item.taskSpec)
    ? (item.taskSpec as { newsroom?: { stage?: string; sourceCount?: number; editorDiffSummary?: string } }).newsroom
    : undefined
  const stageHint = newsroom?.stage
    ? `编辑室阶段：${newsroom.stage}${newsroom.sourceCount != null ? ` · 样本 ${newsroom.sourceCount}` : ""}`
    : ""
  const messages: AimWorkbenchMessage[] = [
    { id: `history-user-${item.id}`, role: "user", content: item.rawInput || "（历史素材）" },
  ]
  const emptyDeliverables = { ...deliverables, id: item.id, results: [] as typeof deliverables.results }
  const status = item.status || (contents.length ? "completed" : undefined)

  if (contents.length) {
    messages.push({
      id: assistantId,
      role: "assistant",
      content: [
        `已加载历史记录${item.topicTitle ? `「${item.topicTitle}」` : ""}，可继续改写或追问。`,
        stageHint,
      ].filter(Boolean).join("\n"),
      agentId: item.agentId ?? undefined,
      deliverables,
      editorDiffSummary: newsroom?.editorDiffSummary || null,
    })
    return { messages, contents, deliverables }
  }

  if (status === "running" || status === "pending") {
    messages.push({
      id: assistantId,
      role: "assistant",
      content: "这条任务还在生成中，刷新后会继续显示进度。",
      agentId: item.agentId ?? undefined,
      deliverables: emptyDeliverables,
      pendingGeneration: true,
    })
    return { messages, contents, deliverables: emptyDeliverables }
  }

  if (status === "awaiting_input") {
    messages.push({
      id: assistantId,
      role: "assistant",
      content: ["还差几项确认才能交稿，直接补充后继续即可。", stageHint].filter(Boolean).join("\n"),
      agentId: item.agentId ?? undefined,
      deliverables: emptyDeliverables,
    })
    return { messages, contents, deliverables: emptyDeliverables }
  }

  if (status === "failed") {
    messages.push({
      id: assistantId,
      role: "assistant",
      content: item.errorMessage || "这次没有完成",
      agentId: item.agentId ?? undefined,
      deliverables: emptyDeliverables,
      failure: {
        kind: "generate",
        retryText: item.rawInput || "",
        recoverable: true,
      },
    })
    return { messages, contents, deliverables: emptyDeliverables }
  }

  messages.push({
    id: assistantId,
    role: "assistant",
    content: ["已加载历史素材，可直接让我改写。", stageHint].filter(Boolean).join("\n"),
    agentId: item.agentId ?? undefined,
    deliverables: emptyDeliverables,
  })
  return { messages, contents, deliverables: emptyDeliverables }
}
