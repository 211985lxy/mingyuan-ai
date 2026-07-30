import { toast } from "sonner"

import { assemblePasteUsageInput, type PastedCopyAttachment } from "@/lib/aim/paste-copy-attachment"
import { prepareAnalyticsIngest } from "@/lib/aim/platform-analytics-ingest"
import { upsertContentOutcome } from "@/lib/api/projects"

/**
 * 复盘粘贴发布数据：解析 → 绑定目标 → 写 Outcome → 发起复盘对话。
 * 未选目标或解析失败时不写库。
 */
export async function runAnalyticsPasteSend(input: {
  attachment: PastedCopyAttachment
  instruction: string
  targetGenerationId: string | null
  setPastedCopy: (next: PastedCopyAttachment | null) => void
  setInput: (next: string) => void
  sendText: (text: string, options?: { resultId?: string }) => Promise<unknown>
}): Promise<boolean> {
  const prepared = prepareAnalyticsIngest({
    text: input.attachment.content,
    generationId: input.targetGenerationId,
  })
  if (prepared.status !== "ready") {
    toast.message(prepared.message)
    return false
  }
  try {
    await upsertContentOutcome(prepared.generationId, prepared.body)
    toast.success(prepared.parsed.summary)
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "发布数据写入失败")
    return false
  }
  const assembled = assemblePasteUsageInput({
    instruction: input.instruction,
    attachment: { ...input.attachment, usage: "analytics" },
  })
  input.setPastedCopy(null)
  input.setInput("")
  await input.sendText(
    assembled || "请基于已登记的发布数据做内容数据复盘。",
    { resultId: prepared.generationId },
  )
  return true
}
