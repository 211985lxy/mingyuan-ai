import { toast } from "sonner"

import type { PastedCopyAttachment } from "@/lib/aim/paste-copy-attachment"
import { splitScripts } from "@/lib/aim/script-structure-extractor-types"
import type { AimWorkbenchMessage, BatchDeliverableResult } from "@/lib/aim/workbench-types"

const CHINESE_DIGITS: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10,
}

/**
 * 从指令解析"生成几条"（用户指令唯一真源：批量数量只来自用户，不再默认 3 条）。
 * 支持"生成5条 / 出三条 / 5条 / 要5个版本"等写法。
 */
export function parseBatchReplicateCount(instruction: string): number | null {
  const text = instruction.trim()
  if (!text) return null
  const digit = text.match(/(?:生成|写|出|做|要|复刻)?\s*(\d{1,2})\s*[条个](?![^条个]{0,2}对标)/)
  if (digit) return Number(digit[1])
  const chinese = text.match(/(?:生成|写|出|做|要|复刻)?\s*([一二三四五六七八九十])\s*[条个]/)
  if (chinese) return CHINESE_DIGITS[chinese[1]] ?? null
  return null
}

/**
 * 批量复刻粘贴发送：检测到多条对标文案时，走 pipeline API 一键提取结构 + 生成文案，
 * 结果以 batchDeliverables 挂到 assistant 消息，展示在聊天流内。
 *
 * 不走标准生成链路（不调 /api/aim/generate 或 /api/aim/chat），
 * 与 runAnalyticsPasteSend 同属「前置分流」模式。
 */
export async function runBatchReplicateSend(input: {
  attachment: PastedCopyAttachment
  instruction: string
  projectId: string | null
  setPastedCopy: (next: PastedCopyAttachment | null) => void
  setInput: (next: string) => void
  setMessages: (updater: (prev: AimWorkbenchMessage[]) => AimWorkbenchMessage[]) => void
}): Promise<boolean> {
  const { attachment, instruction, projectId, setPastedCopy, setInput, setMessages } = input

  if (!projectId) {
    toast.message("批量复刻需要先选择一个项目，生成文案依赖项目知识库。")
    return false
  }

  const scripts = splitScripts(attachment.content)
  const count = parseBatchReplicateCount(instruction)

  // 数量缺失：一次追问，不落任何隐藏默认值；保留粘贴附件与输入，用户补数量后重发即走本分流
  if (!count) {
    setMessages((prev) => [
      ...prev,
      {
        id: `batch-ask-${Date.now()}`,
        role: "assistant" as const,
        content: `这次批量复刻要生成几条新文案？直接在指令里补上数量（例如「生成 5 条」）再发送。已粘贴的 ${scripts.length} 条对标文案我会保留。`,
      },
    ])
    toast.message("请补充生成数量", { description: "例如在输入框补一句「生成 5 条」后重新发送。" })
    return true
  }

  // 1. 立即插入用户消息（展示用户粘贴了什么）
  const userMessage: AimWorkbenchMessage = {
    id: `batch-user-${Date.now()}`,
    role: "user",
    content: instruction.trim() || `批量复刻这 ${scripts.length} 条对标文案，生成 ${count} 条新文案`,
  }
  // 2. 插入占位 assistant 消息（thinking 态）
  const assistantPlaceholderId = `batch-assistant-${Date.now()}`
  const assistantPlaceholder: AimWorkbenchMessage = {
    id: assistantPlaceholderId,
    role: "assistant",
    content: "正在提取结构模板并结合知识库生成文案…",
  }
  setMessages((prev) => [...prev, userMessage, assistantPlaceholder])
  setPastedCopy(null)
  setInput("")

  // 3. 调 pipeline API
  try {
    const res = await fetch("/api/aim/script-structures/pipeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: attachment.content,
        count,
        topicTitle: instruction.trim() || undefined,
        projectId,
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      throw new Error(body.error ?? "批量复刻失败")
    }

    const batch: BatchDeliverableResult = {
      structure: {
        id: body.data.structure.id,
        displayName: body.data.structure.displayName,
        description: body.data.structure.description ?? null,
      },
      scripts: (body.data.scripts ?? []).map(
        (s: { id: string; title: string; content: string }, i: number) => ({
          id: s.id ?? `script-${i}`,
          title: s.title ?? `文案 ${i + 1}`,
          content: s.content ?? "",
        }),
      ),
    }

    // 4. 替换占位消息为最终结果
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantPlaceholderId
          ? {
              ...m,
              content: `已从 ${scripts.length} 条对标文案提取结构「${batch.structure.displayName}」，生成 ${batch.scripts.length} 条新文案。`,
              batchDeliverables: batch,
            }
          : m,
      ),
    )
    toast.success(`已生成 ${batch.scripts.length} 条文案`)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : "批量复刻失败"
    setMessages((prev) =>
      prev.map((m) =>
        m.id === assistantPlaceholderId
          ? { ...m, content: message, failure: { kind: "chat", retryText: "重试批量复刻" } }
          : m,
      ),
    )
    toast.error(message)
    return false
  }
}
