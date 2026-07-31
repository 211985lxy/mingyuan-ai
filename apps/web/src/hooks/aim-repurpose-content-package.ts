"use client"

import { toast } from "sonner"

import {
  generateAimContent,
  updateAimWorkflowStatus,
  type ContentFormat,
} from "@/lib/api/client"
import {
  CONTENT_PACKAGE_FORMAT_LABELS,
  normalizeContentPackageFormats,
} from "@/lib/content-package-spec"
import { getCanonicalFromTaskSpec, isCanonicalConfirmed } from "@/lib/canonical-content-spec"
import { suggestWorkflowAfterContentPackageComplete } from "@/lib/aim/content-package-workflow"
import { patchDeliverableWorkflowFields } from "@/lib/aim/workbench-helpers"
import type { AimGenerationActionInput } from "@/hooks/use-aim-generation-actions"

/**
 * @description 基于已确认母内容派生多平台内容包，并在齐套后建议推进工作流
 */
export async function repurposeDeliverable(
  input: AimGenerationActionInput,
  messageId: string,
  formatsInput: ContentFormat | ContentFormat[],
) {
  input.setIsGenerating(true)
  try {
    if (input.projectEnabled && !input.selectedProjectId) return toast.error("你的 IP 营销全案还在配置中")
    const deliverables = input.messages.find((message) => message.id === messageId)?.deliverables
    const mainContent = deliverables?.results.find((result) => result.format === "video_script")?.content
      || deliverables?.results.find((result) => result.format === "koubo_script")?.content
    if (!mainContent) return toast.error("请先有口播/主稿，再拆多平台")

    const canonical = getCanonicalFromTaskSpec(deliverables?.taskSpec)
    if (!isCanonicalConfirmed(canonical)) {
      return toast.error("请先确认母内容，再拆成多平台")
    }

    const requested = normalizeContentPackageFormats(
      Array.isArray(formatsInput) ? formatsInput : [formatsInput],
      { min: 1, max: 5 },
    )
    if (requested.length === 0) return toast.error("请至少选择一个平台格式")

    const response = await generateAimContent({
      rawInput: `基于已确认母内容与以下主稿，派生多平台内容包（${requested.map((format) => CONTENT_PACKAGE_FORMAT_LABELS[format]).join("、")}）。共享核心观点与证据，但每个平台独立改写，禁止复制同一正文只换标题。\n\n【主稿】\n${mainContent}`,
      targetFormats: requested,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
      taskType: "repurpose",
      existingGenerationId: deliverables?.id,
      agentId: "content_producer",
    })

    input.setMessages((messages) =>
      messages.map((message) => {
        if (message.id !== messageId || !message.deliverables) return message
        const byFormat = new Map<string, (typeof response.results)[number]>()
        for (const item of message.deliverables.results) byFormat.set(item.format, item)
        for (const item of response.results) {
          if (item.content.trim()) byFormat.set(item.format, item)
        }
        const artifacts = response.taskSpec?.contentPackage?.artifacts
        if (artifacts) {
          for (const [format, content] of Object.entries(artifacts)) {
            if (content?.trim() && !byFormat.has(format)) {
              byFormat.set(format, {
                format: format as ContentFormat,
                content,
                wordCount: content.length,
              })
            }
          }
        }
        return {
          ...message,
          deliverables: {
            ...message.deliverables,
            id: response.id || message.deliverables.id,
            results: [...byFormat.values()],
            taskSpec: response.taskSpec ?? message.deliverables.taskSpec,
            knowledgeUsed: response.knowledgeUsed?.length
              ? response.knowledgeUsed
              : message.deliverables.knowledgeUsed,
            qualityChecks: response.qualityChecks ?? message.deliverables.qualityChecks,
            qualityStatus: response.qualityStatus ?? message.deliverables.qualityStatus,
            workflowStatus: response.workflowStatus ?? message.deliverables.workflowStatus,
          },
        }
      }),
    )
    void input.refreshHistory({ force: true })
    const failed = response.taskSpec?.contentPackage?.failedFormats ?? []
    if (failed.length > 0) {
      toast.success(
        `已完成 ${requested.length - failed.length}/${requested.length} 个格式；失败项可单独重试`,
      )
    } else {
      toast.success(`已生成 ${requested.length} 个平台格式`)
      const suggestion = suggestWorkflowAfterContentPackageComplete({
        taskSpec: response.taskSpec,
        currentStatus: deliverables?.workflowStatus,
      })
      if (suggestion?.shouldAdvance && deliverables?.id) {
        try {
          await updateAimWorkflowStatus(deliverables.id, { workflowStatus: suggestion.to })
          input.setMessages((messages) => patchDeliverableWorkflowFields(messages, deliverables.id, {
            workflowStatus: suggestion.to,
          }))
          toast.message("内容包已齐", { description: suggestion.reason })
        } catch {
          toast.message("内容包已齐", { description: "可手动推进到「待审核」" })
        }
      }
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "生成失败")
  } finally {
    input.setIsGenerating(false)
  }
}
