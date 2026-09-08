import { mapAimGenerationToDeliverables } from "@/lib/aim/workbench-helpers"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { AimGeneration } from "@/lib/api/client"
import {
  classifyAimFailure,
  mapAimFailureCodeToUserMessage,
  type AimFailureCode,
} from "@/lib/aim-error-message"

const NON_RECOVERABLE_FAILURES: ReadonlySet<AimFailureCode> = new Set([
  "PROVIDER_AUTH",
  "INVALID_REQUEST",
  "BOUND_PROJECT_UNAVAILABLE",
  "INTERNAL_ERROR",
])

function parseHistoryFailure(errorMessage: string | null): {
  code: AimFailureCode
  message: string
  recoverable: boolean
} {
  const raw = errorMessage?.trim() || "生成失败"
  const codeMatch = raw.match(/^([A-Z][A-Z0-9_]+):\s*/)
  const code = codeMatch ? classifyAimFailure({ code: codeMatch[1] }) : classifyAimFailure(new Error(raw))
  return {
    code,
    message: mapAimFailureCodeToUserMessage(code),
    recoverable: !NON_RECOVERABLE_FAILURES.has(code),
  }
}

function resolveNewsroomHint(item: AimGeneration) {
  const newsroom = item.taskSpec && typeof item.taskSpec === "object" && !Array.isArray(item.taskSpec)
    ? (item.taskSpec as { newsroom?: { stage?: string; sourceCount?: number; editorDiffSummary?: string } }).newsroom
    : undefined
  return {
    editorDiffSummary: newsroom?.editorDiffSummary || null,
    stageHint: newsroom?.stage
      ? `编辑室阶段：${newsroom.stage}${newsroom.sourceCount != null ? ` · 样本 ${newsroom.sourceCount}` : ""}`
      : "",
  }
}

function buildFailedHistoryAssistant(item: AimGeneration, assistantId: string, emptyDeliverables: AimWorkbenchMessage["deliverables"]) {
  const failure = parseHistoryFailure(item.errorMessage ?? null)
  return {
    id: assistantId,
    role: "assistant" as const,
    content: failure.message,
    agentId: item.agentId ?? undefined,
    deliverables: emptyDeliverables,
    failure: {
      kind: "generate" as const,
      retryText: item.rawInput || "",
      code: failure.code,
      generationId: item.id,
      recoverable: failure.recoverable,
    },
  }
}

export function buildAimHistoryLoadMessages(item: AimGeneration, assistantId: string) {
  const deliverables = mapAimGenerationToDeliverables(item)
  const contents = deliverables.results
  const { editorDiffSummary, stageHint } = resolveNewsroomHint(item)
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
      editorDiffSummary,
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
      // 保留统一入口的澄清前缀；刷新页面后，服务端仍能识别下一条是
      // 对上一轮追问的回答，而不是一条需要重新判断的新任务。
      content: ["在动笔前先确认：还差几项确认才能交稿，直接补充后继续即可。", stageHint].filter(Boolean).join("\n"),
      agentId: item.agentId ?? undefined,
      deliverables: emptyDeliverables,
      generationId: item.id,
      generationStatus: "awaiting_input",
    })
    return { messages, contents, deliverables: emptyDeliverables }
  }

  if (status === "failed") {
    messages.push(buildFailedHistoryAssistant(item, assistantId, emptyDeliverables))
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
