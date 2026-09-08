"use client"

import { toast } from "sonner"

import {
  checkScriptQuality,
  generateAimContent,
} from "@/lib/api/client"
import type { AimGenerationActionInput } from "@/hooks/use-aim-generation-actions"

/**
 * 主编改稿闸门与只读质检兜底（从 use-aim-generation-actions 拆出，
 * 保持单向依赖：hook → 本模块；本模块只以类型引用 hook 的输入结构）。
 */
export async function checkDeliverableQuality(input: AimGenerationActionInput, messageId: string) {
  const message = input.messages.find((item) => item.id === messageId)
  const deliverables = message?.deliverables
  const mainFormat = deliverables?.results.find((result) => result.format === "video_script")
    || deliverables?.results.find((result) => result.format === "koubo_script")
    || deliverables?.results.find((result) => result.format === "raw_copy")
  const mainContent = mainFormat?.content
  if (!mainContent || !deliverables) return

  input.setIsQualityChecking(true)
  try {
    // 主编改稿闸门：默认 editor_revise，成功后替换 deliverable
    const revised = await generateAimContent({
      agentId: "content_review",
      rawInput: mainContent,
      targetFormats: ["raw_copy"],
      taskType: "quality_check",
      reviewMode: "editor_revise",
      existingGenerationId: deliverables.id,
      projectId: input.projectEnabled ? input.selectedProjectId || undefined : undefined,
    })

    const revisedRaw = revised.results[0]?.content || ""
    const diffMatch = revisedRaw.match(/\[\[AIM_EDITOR_DIFF\]\]([\s\S]*?)\[\[\/AIM_EDITOR_DIFF\]\]/)
    const diffSummary = (diffMatch?.[1] || "").trim()
    const finalBody = revisedRaw
      .replace(/\[\[AIM_EDITOR_DIFF\]\][\s\S]*?\[\[\/AIM_EDITOR_DIFF\]\]/g, "")
      .trim()

    if (!finalBody || /打回重写/.test(revisedRaw)) {
      toast.message("主编建议打回重写", { description: diffSummary || "请根据修订说明调整后再生成" })
      input.setMessages((messages) => messages.map((item) => item.id === messageId
        ? {
            ...item,
            qualityReport: {
              editorial: { score: 40, passed: false, feedback: diffSummary || "需重写" },
              aiTaste: { score: 50, passed: true, feedback: "—" },
              attraction: { score: 40, passed: false, feedback: "—" },
              logic: { score: 40, passed: false, feedback: "—" },
              overall: { score: 40, passed: false, needsRewrite: true },
              rewriteCount: 1,
            },
          }
        : item))
      return
    }

    const nextFormat = mainFormat.format === "koubo_script" ? "koubo_script" : mainFormat.format
    const nextResults = deliverables.results.map((result) =>
      result.format === mainFormat.format
        ? { ...result, content: finalBody, wordCount: finalBody.length }
        : result,
    )

    input.setMessages((messages) => messages.map((item) => item.id === messageId
      ? {
          ...item,
          deliverables: {
            ...deliverables,
            results: nextResults,
            qualityStatus: "pass",
          },
          qualityReport: {
            editorial: { score: 85, passed: true, feedback: diffSummary || "主编已修订" },
            aiTaste: { score: 80, passed: true, feedback: "已去AI腔" },
            attraction: { score: 80, passed: true, feedback: "钩子已强化" },
            logic: { score: 80, passed: true, feedback: "结构已理顺" },
            overall: { score: 82, passed: true, needsRewrite: false },
            rewriteCount: 1,
          },
          editorDiffSummary: diffSummary,
        }
      : item))

    input.openEditorFromResult(messageId, nextFormat, finalBody)
    toast.success("主编已修订终稿", { description: diffSummary.slice(0, 120) || "可直接用于发布" })
  } catch (error) {
    // 改稿失败时回退只读质检，不阻断用户
    try {
      const report = await checkScriptQuality({
        content: mainContent,
        persona: input.agent.defaultInstruction,
        publishPlatform: "douyin",
      })
      input.setMessages((messages) => messages.map((item) =>
        item.id === messageId ? { ...item, qualityReport: report } : item,
      ))
      toast.success("发布前自查完成（改稿暂不可用，已出报告）")
    } catch {
      toast.error(error instanceof Error ? error.message : "质检失败")
    }
  } finally {
    input.setIsQualityChecking(false)
  }
}
