"use client"

import { useCallback, type Dispatch, type SetStateAction } from "react"
import { toast } from "sonner"

import {
  checkScriptQuality,
  generateAimContent,
  recordAimRunEvent,
  updateAimWorkflowStatus,
  type ContentFormat,
} from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { FORMAT_LABELS, workflowStatusLabel } from "@/features/aim/aim-format-labels"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"

const ACCEPTED_WORKFLOW_STATUSES = new Set(["ready_to_shoot", "ready_to_publish", "published"])

function reportAimRunEvent(
  runId: string | null | undefined,
  event: "copied" | "revised" | "accepted",
  metadata?: Record<string, unknown>,
) {
  if (!runId) return
  void recordAimRunEvent(runId, event, metadata).catch(() => undefined)
}

interface UseAimPublishActionsOptions {
  messages: ChatMessage[]
  selectedAgentId: AimAgentId
  selectedProjectId: string
  projectEnabled: boolean
  agentInstruction: string
  refreshHistory: (opts?: { force?: boolean; agentId?: string; projectId?: string }) => Promise<void>
  refreshProjectWorkflow: () => void | (() => void) | Promise<void | (() => void)>
  setMessages: Dispatch<SetStateAction<ChatMessage[]>>
  setIsGenerating: Dispatch<SetStateAction<boolean>>
  setIsQualityChecking: Dispatch<SetStateAction<boolean>>
}

export function useAimPublishActions({
  messages,
  selectedAgentId,
  selectedProjectId,
  projectEnabled,
  agentInstruction,
  refreshHistory,
  refreshProjectWorkflow,
  setMessages,
  setIsGenerating,
  setIsQualityChecking,
}: UseAimPublishActionsOptions) {
  const handleRepurpose = useCallback(
    (msgId: string) => async (fmt: ContentFormat) => {
      setIsGenerating(true)
      try {
        if (projectEnabled && !selectedProjectId) {
          toast.error("你的 IP 营销全案还在配置中")
          return
        }
        const base = messages.find((message) => message.id === msgId)?.deliverables
        const mainContent = base?.results.find((result) => result.format === "video_script")?.content
        if (!mainContent) return
        const response = await generateAimContent({
          rawInput: `基于以下脚本，派生${FORMAT_LABELS[fmt]}：\n\n${mainContent}`,
          targetFormats: [fmt],
          projectId: projectEnabled ? selectedProjectId || undefined : undefined,
          taskType: "repurpose",
        })
        setMessages((prev) =>
          prev.map((message) =>
            message.id === msgId && message.deliverables
              ? { ...message, deliverables: { ...message.deliverables, results: [...message.deliverables.results, ...response.results] } }
              : message,
          ),
        )
        refreshHistory({ force: true, agentId: selectedAgentId })
        toast.success(`${FORMAT_LABELS[fmt]}已生成`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "生成失败")
      } finally {
        setIsGenerating(false)
      }
    },
    [messages, projectEnabled, refreshHistory, selectedAgentId, selectedProjectId, setIsGenerating, setMessages],
  )

  const handleQuality = useCallback(
    (msgId: string) => async () => {
      const base = messages.find((message) => message.id === msgId)?.deliverables
      const mainContent =
        base?.results.find((result) => result.format === "video_script")?.content
        || base?.results.find((result) => result.format === "koubo_script")?.content
      if (!mainContent) return
      setIsQualityChecking(true)
      try {
        const report = await checkScriptQuality({
          content: mainContent,
          persona: agentInstruction,
          publishPlatform: "douyin",
        })
        setMessages((prev) =>
          prev.map((message) => (message.id === msgId ? { ...message, qualityReport: report } : message)),
        )
        toast.success("发布前自查完成")
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "质检失败")
      } finally {
        setIsQualityChecking(false)
      }
    },
    [agentInstruction, messages, setIsQualityChecking, setMessages],
  )

  const handleMarkStatus = useCallback(
    (msgId: string) => async (status: string) => {
      const message = messages.find((item) => item.id === msgId)
      const base = message?.deliverables
      if (!base?.id || base.id.startsWith("polish-")) {
        toast.error("只有已保存的内容才能推进状态")
        return
      }
      try {
        await updateAimWorkflowStatus(base.id, { workflowStatus: status })
        if (ACCEPTED_WORKFLOW_STATUSES.has(status)) {
          reportAimRunEvent(message?.runId, "accepted", { workflowStatus: status })
        }
        refreshHistory({ force: true, agentId: selectedAgentId })
        refreshProjectWorkflow()
        toast.success(`已标记为：${workflowStatusLabel(status)}`)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "状态更新失败")
      }
    },
    [messages, refreshHistory, refreshProjectWorkflow, selectedAgentId],
  )

  return {
    handleRepurpose,
    handleQuality,
    handleMarkStatus,
  }
}
